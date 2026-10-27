// Tools for the Paste Menu HUD (tools/paste-menu): text snippets by category and the fixed "Macro" tab.
// The HUD watches these files and reloads itself within ~1 s, so edits here show up live.
// File formats are owned by paste-menu.ahk - keep Esc/Unesc and the line layouts in sync with it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { ok, fail, safe } from "./util.js";
import { parseChord } from "./catalog.js";

const dir = () => path.join(process.env.PASTEMENU_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "PasteMenu"));
const itemsFile = () => path.join(dir(), "items.txt");
const macrosFile = () => path.join(dir(), "macros.txt");

const esc = (s) => String(s).replaceAll("\\", "\\\\").replaceAll("\r", "").replaceAll("\n", "\\n").replaceAll("\t", "\\t");
const unesc = (s) => s.replace(/\\(\\|n|t)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : "\\"));

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

// ---- items -------------------------------------------------------------------------------
function loadItems() {
  const cats = [];
  if (fs.existsSync(itemsFile())) {
    for (const line of fs.readFileSync(itemsFile(), "utf8").split(/\r?\n/)) {
      if (!line) continue;
      const kind = line[0], val = line.slice(2);
      if (kind === "C") { if (!cats.some((c) => c.name === unesc(val))) cats.push({ name: unesc(val), items: [] }); }
      else if (kind === "I" && cats.length) cats[cats.length - 1].items.push(unesc(val));
    }
  }
  return cats;
}
function saveItems(cats) {
  writeAtomic(itemsFile(), cats.map((c) => `C\t${esc(c.name)}\n` + c.items.map((t) => `I\t${esc(t)}\n`).join("")).join(""));
}

// ---- macros ------------------------------------------------------------------------------
const NAMED_TRIGGERS = new Set(["XButton1", "XButton2", "MButton", "CapsLock", "ScrollLock", "NumLock", "Insert", "Home", "End", "PgUp", "PgDn", "Delete", "Left", "Right", "Up", "Down", "Pause", "PrintScreen", "AppsKey", "Tab", "Enter", "Space", "Backspace", "Escape", "LWin", "RWin", "LControl", "RControl", "LShift", "RShift", "LAlt", "RAlt", "Browser_Back", "Browser_Forward", "Browser_Refresh", "Browser_Home", "Media_Next", "Media_Prev", "Media_Stop", "Media_Play_Pause", "Volume_Mute", "Volume_Up", "Volume_Down", "Launch_Mail", "Launch_Media", "Launch_App1", "Launch_App2",
  ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`), "NumpadAdd", "NumpadSub", "NumpadMult", "NumpadDiv", "NumpadDot", "NumpadEnter"]);

function validTrigger(t) {
  return /^[A-Za-z0-9]$/.test(t) || /^F([1-9]|1\d|2[0-4])$/i.test(t) || NAMED_TRIGGERS.has(t) || /^[-=\[\];',./`\\]$/.test(t);
}

function loadMacros() {
  const out = [];
  if (!fs.existsSync(macrosFile())) return out;
  for (const line of fs.readFileSync(macrosFile(), "utf8").split(/\r?\n/)) {
    const f = line.split("\t");
    if (f.length < 6 || f[0] !== "M" || !f[3]) continue;
    out.push({ id: unesc(f[1]), name: unesc(f[2]), trigger: unesc(f[3]), steps: unesc(f[4]), active: f[5] === "1" });
  }
  return out;
}
function saveMacros(list) {
  let seen = false; // at most one active
  for (const m of list) { if (m.active && seen) m.active = false; else if (m.active) seen = true; }
  writeAtomic(macrosFile(), list.map((m) => `M\t${esc(m.id)}\t${esc(m.name)}\t${esc(m.trigger)}\t${esc(m.steps)}\t${m.active ? 1 : 0}\n`).join(""));
}
const describeSteps = (s) => s.split(";;").filter(Boolean);

const stepSchema = z.union([
  z.object({ key: z.string().describe("A chord: 'Enter', 'Ctrl+C', 'Ctrl+Shift+P', 'F5' ...") }),
  z.object({ text: z.string().describe("Literal text to type") }),
  z.object({ delay: z.number().int().min(0).max(10000).describe("Pause in milliseconds") }),
]);

export function registerPasteTools(server) {
  const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  const READ = { readOnlyHint: true, openWorldHint: false };

  // ------------------------------------------------------------------ macros
  server.registerTool(
    "openlogi_macro_list",
    {
      title: "List macros",
      description: "List the quick keyboard macros shown in the Paste Menu's fixed 'Macro' tab. A macro = one trigger key -> a fast sequence of steps. All macros are inactive by default and at most ONE can be active at a time.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => ok({ file: macrosFile(), macros: loadMacros().map((m) => ({ ...m, steps: describeSteps(m.steps) })) })),
  );

  server.registerTool(
    "openlogi_macro_set",
    {
      title: "Create or update a macro",
      description: "Create (or replace, by id) a quick keyboard macro for the Paste Menu 'Macro' tab. `trigger` is ONE key (AutoHotkey name: F9, XButton2, CapsLock, a, Numpad1, Media_Next ...). `steps` run in order when the trigger is pressed: { key: 'Ctrl+C' }, { text: 'hello' }, { delay: 50 }. New macros are created inactive unless active=true; activating one deactivates any other (max 1 active). The trigger key is swallowed while the macro is active. The HUD reloads within ~1 s.",
      inputSchema: {
        id: z.string().regex(/^[a-z0-9_-]{1,40}$/).describe("Stable slug, e.g. 'save-and-close'"),
        name: z.string().min(1).max(60),
        trigger: z.string(),
        steps: z.array(stepSchema).min(1).max(40),
        active: z.boolean().default(false),
      },
      annotations: EDIT,
    },
    safe(async ({ id, name, trigger, steps, active }) => {
      if (!validTrigger(trigger)) return fail(`'${trigger}' is not a single valid trigger key. Examples: F9, XButton2, CapsLock, a, Numpad1, Media_Next`);
      const enc = [];
      for (const [i, s] of steps.entries()) {
        if ("key" in s) { const c = parseChord(s.key); if (!c.ok) return fail(`step ${i + 1}: ${c.error}`); enc.push(`key:${c.canonical}`); }
        else if ("text" in s) { if (s.text.includes(";;")) return fail(`step ${i + 1}: text cannot contain ';;'`); enc.push(`text:${s.text}`); }
        else enc.push(`delay:${s.delay}`);
      }
      const list = loadMacros();
      const entry = { id, name, trigger, steps: enc.join(";;"), active };
      const idx = list.findIndex((m) => m.id === id);
      if (idx >= 0) list[idx] = entry; else list.push(entry);
      if (active) for (const m of list) if (m.id !== id) m.active = false;
      saveMacros(list);
      return ok({ saved: { ...entry, steps: describeSteps(entry.steps) }, note: "HUD reloads within ~1 s; the macro is " + (active ? "ACTIVE (others deactivated)" : "inactive until activated") });
    }),
  );

  server.registerTool(
    "openlogi_macro_activate",
    {
      title: "Activate / deactivate a macro",
      description: "Activate one macro by id (deactivating all others - max 1 active), or pass id=null / omit it to deactivate everything.",
      inputSchema: { id: z.string().nullable().optional() },
      annotations: EDIT,
    },
    safe(async ({ id }) => {
      const list = loadMacros();
      if (id && !list.some((m) => m.id === id)) return fail(`no macro '${id}'. Known: ${list.map((m) => m.id).join(", ") || "(none)"}`);
      for (const m of list) m.active = !!id && m.id === id;
      saveMacros(list);
      return ok({ active: id ?? null });
    }),
  );

  server.registerTool(
    "openlogi_macro_delete",
    {
      title: "Delete a macro",
      description: "Delete a macro by id.",
      inputSchema: { id: z.string() },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ id }) => {
      const list = loadMacros();
      const next = list.filter((m) => m.id !== id);
      if (next.length === list.length) return fail(`no macro '${id}'`);
      saveMacros(next);
      return ok({ deleted: id });
    }),
  );

  // ------------------------------------------------------------------ paste items
  server.registerTool(
    "openlogi_paste_list",
    {
      title: "List paste-menu categories and items",
      description: "Show the Paste Menu's categories (tabs) and their text items.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => ok({ file: itemsFile(), categories: loadItems() })),
  );

  server.registerTool(
    "openlogi_paste_add_item",
    {
      title: "Add paste-menu item",
      description: "Add a text snippet to a category of the Paste Menu (clicking it in the HUD pastes it into the focused field). Creates the category if missing.",
      inputSchema: { category: z.string().min(1), text: z.string().min(1) },
      annotations: EDIT,
    },
    safe(async ({ category, text }) => {
      const cats = loadItems();
      let c = cats.find((x) => x.name === category);
      if (!c) { c = { name: category, items: [] }; cats.push(c); }
      c.items.push(text);
      saveItems(cats);
      return ok({ category, items: c.items.length });
    }),
  );

  server.registerTool(
    "openlogi_paste_remove_item",
    {
      title: "Remove paste-menu item",
      description: "Remove an item by 1-based position within a category, or by exact text.",
      inputSchema: { category: z.string(), index: z.number().int().min(1).optional(), text: z.string().optional() },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ category, index, text }) => {
      const cats = loadItems();
      const c = cats.find((x) => x.name === category);
      if (!c) return fail(`no category '${category}'`);
      const i = index !== undefined ? index - 1 : c.items.indexOf(text);
      if (i < 0 || i >= c.items.length) return fail("item not found");
      const [gone] = c.items.splice(i, 1);
      saveItems(cats);
      return ok({ removed: gone });
    }),
  );

  server.registerTool(
    "openlogi_paste_category",
    {
      title: "Manage paste-menu categories",
      description: "Create, rename or delete a category (tab). 'Macro' is a reserved fixed tab and cannot be used. Deleting removes its items; at least one category must remain.",
      inputSchema: { action: z.enum(["create", "rename", "delete"]), name: z.string().min(1), new_name: z.string().min(1).optional() },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ action, name, new_name }) => {
      const cats = loadItems();
      if (name.toLowerCase() === "macro" || new_name?.toLowerCase() === "macro") return fail("'Macro' is a reserved tab");
      const c = cats.find((x) => x.name === name);
      if (action === "create") {
        if (c) return fail(`'${name}' already exists`);
        cats.push({ name, items: [] });
      } else if (!c) return fail(`no category '${name}'`);
      else if (action === "rename") {
        if (!new_name) return fail("rename needs new_name");
        if (cats.some((x) => x.name === new_name)) return fail(`'${new_name}' already exists`);
        c.name = new_name;
      } else {
        if (cats.length === 1) return fail("at least one category must remain");
        cats.splice(cats.indexOf(c), 1);
      }
      saveItems(cats);
      return ok({ categories: cats.map((x) => x.name) });
    }),
  );
}
