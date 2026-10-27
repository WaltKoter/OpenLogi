import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { parse } from "smol-toml";

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "openlogi-mcp-"));
const cfgFile = path.join(tmp, "config.toml");
fs.writeFileSync(cfgFile, `schema_version = 8
selected_device = "unit:6be9d300"

[devices."unit:6be9d300"]
custom_name = "Office mouse"
dpi = 1600

[devices."unit:6be9d300".identity]
display_name = "MX Master 3S"
kind = "mouse"
capabilities = {}
`);

const client = new Client({ name: "test", version: "0.0.0" });
await client.connect(new StdioClientTransport({
  command: process.execPath,
  args: [path.join(here, "..", "src", "index.js")],
  env: { ...process.env, PASTEMENU_DIR: path.join(tmp, "pm"), OPENLOGI_CONFIG: cfgFile, OPENLOGI_BIN: path.join(tmp, "missing.exe") },
}));

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  let json; try { json = JSON.parse(text); } catch { /* plain text */ }
  return { error: !!r.isError, text, json };
};
// smol-toml yields null-prototype objects; round-trip through JSON so deepStrictEqual compares plain data.
const cfg = () => JSON.parse(JSON.stringify(parse(fs.readFileSync(cfgFile, "utf8"))));

test("registers a complete tool surface", async () => {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name);
  assert.ok(names.length >= 45, `only ${names.length} tools`);
  for (const n of ["openlogi_set_binding", "openlogi_set_gesture", "openlogi_dpi", "openlogi_smartshift", "openlogi_set_ring_slot", "openlogi_backlight", "openlogi_light", "openlogi_camera", "openlogi_diag"]) assert.ok(names.includes(n), n);
});

test("catalogs", async () => {
  const a = await call("openlogi_list_actions");
  assert.ok(a.json.unit_actions.Media.some((x) => x.name === "PlayPause"));
  const b = await call("openlogi_list_buttons");
  assert.equal(b.json.mouse_buttons.length, 13);
  assert.ok(b.json.keyboard_controls.length >= 40);
});

test("chord validation", async () => {
  assert.equal((await call("openlogi_validate_shortcut", { chord: "ctrl+shift+p" })).json.chord.canonical, "Ctrl+Shift+P");
  assert.equal((await call("openlogi_validate_shortcut", { chord: "ctrl+a+b" })).json.chord.ok, false);
  assert.equal((await call("openlogi_validate_shortcut", { trigger: "cmd+shift+f5" })).json.trigger.canonical, "shift+command+f5");
});

test("single, shortcut and per-app bindings", async () => {
  let r = await call("openlogi_set_binding", { button: "Back", binding: "MouseBack", reload: false });
  assert.ok(!r.error, r.text);
  r = await call("openlogi_set_binding", { button: "Forward", binding: { TapKeyHoldingModifiers: "cmd+tab" }, reload: false });
  assert.ok(!r.error, r.text);
  r = await call("openlogi_set_binding", { button: "MiddleClick", binding: { CustomShortcut: "F1" }, app: "exe:sharex.exe", reload: false });
  assert.ok(!r.error, r.text);
  const c = cfg().devices["unit:6be9d300"];
  assert.equal(c.bindings.Back, "MouseBack");
  assert.deepEqual(c.bindings.Forward, { TapKeyHoldingModifiers: "Cmd+Tab" });
  assert.deepEqual(c.per_app_bindings["exe:sharex.exe"].MiddleClick, { CustomShortcut: "F1" });
});

test("rejects bad input", async () => {
  assert.ok((await call("openlogi_set_binding", { button: "Nope", binding: "Copy", reload: false })).error);
  assert.ok((await call("openlogi_set_binding", { button: "Back", binding: "Teleport", reload: false })).error);
  assert.ok((await call("openlogi_set_binding", { button: "MiddleClick", binding: { Up: "Copy" }, reload: false })).error, "gesture on non-gesture button");
  assert.ok((await call("openlogi_set_binding", { button: "MiddleClick", binding: { click: "Copy", wheel: "HorizontalScroll" }, reload: false })).error, "wheel-hold only on Back/Forward");
});

test("command-class actions need explicit opt-in", async () => {
  const denied = await call("openlogi_set_binding", { button: "Thumbwheel", binding: { RunShellCommand: "echo hi" }, reload: false });
  assert.ok(denied.error);
  assert.equal(cfg().devices["unit:6be9d300"].bindings.Thumbwheel, undefined);
  const allowed = await call("openlogi_set_binding", { button: "Thumbwheel", binding: { RunShellCommand: "echo hi" }, allow_command_actions: true, reload: false });
  assert.ok(!allowed.error, allowed.text);
});

test("gesture map, long press, wheel hold", async () => {
  let r = await call("openlogi_set_gesture", { button: "GestureButton", direction: "Up", action: "MissionControl", reload: false });
  assert.ok(r.error, "needs enable_gesture_mode");
  r = await call("openlogi_set_gesture", { button: "GestureButton", direction: "Up", action: "MissionControl", enable_gesture_mode: true, reload: false });
  assert.ok(!r.error, r.text);
  r = await call("openlogi_set_gesture_mode", { button: "GestureButton", enabled: true, directions: { Down: "AppExpose", Left: "PreviousDesktop", Right: "NextDesktop", Click: "MissionControl" }, reload: false });
  assert.ok(!r.error, r.text);
  assert.deepEqual(cfg().devices["unit:6be9d300"].bindings.GestureButton, { Up: "MissionControl", Down: "AppExpose", Left: "PreviousDesktop", Right: "NextDesktop", Click: "MissionControl" });
  r = await call("openlogi_set_gesture_mode", { button: "GestureButton", enabled: false, reload: false });
  assert.equal(cfg().devices["unit:6be9d300"].bindings.GestureButton, "MissionControl");
  assert.ok(cfg().devices["unit:6be9d300"].disabled_gestures.GestureButton.Down === "AppExpose");
  r = await call("openlogi_set_gesture_mode", { button: "GestureButton", enabled: true, reload: false });
  assert.equal(cfg().devices["unit:6be9d300"].bindings.GestureButton.Down, "AppExpose");

  r = await call("openlogi_set_long_press", { button: "DpiToggle", short: "ShowDesktop", long: "MissionControl", reload: false });
  assert.ok(!r.error, r.text);
  assert.deepEqual(cfg().devices["unit:6be9d300"].bindings.DpiToggle, { short: "ShowDesktop", long: "MissionControl" });
  r = await call("openlogi_set_wheel_hold", { button: "Back", reload: false });
  assert.deepEqual(cfg().devices["unit:6be9d300"].bindings.Back, { click: "BrowserBack", wheel: "HorizontalScroll" });
});

test("keyboard keys and global triggers", async () => {
  let r = await call("openlogi_set_binding", { button: "KeySearch", binding: "MissionControl", reload: false });
  assert.ok(!r.error, r.text);
  r = await call("openlogi_set_binding", { button: "control:0x00d4", binding: "Sleep", reload: false });
  assert.ok(!r.error, r.text);
  assert.equal(cfg().devices["unit:6be9d300"].bindings.KeySearch, "Sleep");
  assert.equal(cfg().devices["unit:6be9d300"].bindings["control:0x00d4"], undefined);
  r = await call("openlogi_set_binding", { button: "KeySearch", binding: "None", reload: false });
  assert.equal(cfg().devices["unit:6be9d300"].bindings.KeySearch, undefined);
  r = await call("openlogi_set_keyboard_binding", { trigger: "cmd+shift+f5", action: "ShowDesktop", reload: false });
  assert.equal(cfg().keyboard.bindings["shift+command+f5"], "ShowDesktop");
});

test("actions ring", async () => {
  let r = await call("openlogi_set_ring_slot", { slot: "Top", entry: { action: "Copy", icon: "Keyboard" }, reload: false });
  assert.ok(!r.error, r.text);
  r = await call("openlogi_set_ring_slot", { slot: "Right", entry: { action: { OpenApplication: { path: "C:/x/app.exe", display_name: "App" } }, label: "App" }, app: "exe:code.exe", reload: false });
  assert.ok(!r.error, r.text);
  assert.ok((await call("openlogi_set_ring_slot", { slot: "Left", entry: "ShowActionsRing", reload: false })).error);
  const ring = cfg().devices["unit:6be9d300"].action_ring;
  assert.deepEqual(ring.default.slots.Top, { action: "Copy", icon: "Keyboard" });
  assert.equal(ring.per_app["exe:code.exe"].slots.Right.label, "App");
});

test("device + app settings, validation, dry run, backups", async () => {
  let r = await call("openlogi_set_device_settings", { settings: { dpi: 2400, smartshift: { mode: "ratchet", auto_disengage: 16 } }, reload: false });
  assert.ok(!r.error, r.text);
  assert.ok((await call("openlogi_set_device_settings", { settings: { dpi: -5 }, reload: false })).error);
  assert.ok((await call("openlogi_set_device_settings", { settings: { bogus: 1 }, reload: false })).error);
  assert.ok((await call("openlogi_set_app_settings", { settings: { vertical_scroll_sensitivity: 500 }, reload: false })).error);
  r = await call("openlogi_set_app_settings", { settings: { smooth_scroll: true, vertical_scroll_sensitivity: 20 }, reload: false });
  assert.ok(!r.error, r.text);
  const before = fs.readFileSync(cfgFile, "utf8");
  r = await call("openlogi_set_dpi_presets", { presets: [800, 1600], dry_run: true });
  assert.equal(r.json.dry_run, true);
  assert.equal(fs.readFileSync(cfgFile, "utf8"), before, "dry run must not write");
  assert.equal((await call("openlogi_config_validate")).json.valid, true);
  const backups = (await call("openlogi_config_backups")).json.backups;
  assert.ok(backups.length > 3);
  fs.writeFileSync(cfgFile, "schema_version = 8\n");
  r = await call("openlogi_config_restore", { name: backups[0].name, reload: false });
  assert.ok(!r.error, r.text);
  assert.ok(cfg().devices);
});

test("paste menu: macros (max 1 active, default inactive) and items", async () => {
  let r = await call("openlogi_macro_set", { id: "save-close", name: "Salvar e fechar", trigger: "F9", steps: [{ key: "Ctrl+S" }, { delay: 50 }, { key: "Ctrl+W" }] });
  assert.ok(!r.error, r.text);
  r = await call("openlogi_macro_set", { id: "greet", name: "Saudacao", trigger: "XButton2", steps: [{ text: "ola" }, { key: "Enter" }] });
  assert.ok(!r.error, r.text);
  let list = (await call("openlogi_macro_list")).json.macros;
  assert.equal(list.length, 2);
  assert.ok(list.every((m) => !m.active), "inactive by default");
  await call("openlogi_macro_activate", { id: "save-close" });
  await call("openlogi_macro_set", { id: "greet", name: "Saudacao", trigger: "XButton2", steps: [{ text: "ola" }], active: true });
  list = (await call("openlogi_macro_list")).json.macros;
  assert.equal(list.filter((m) => m.active).length, 1);
  assert.equal(list.find((m) => m.active).id, "greet");
  assert.ok((await call("openlogi_macro_set", { id: "bad", name: "x", trigger: "Ctrl+A", steps: [{ key: "A" }] })).error, "single-key trigger only");
  assert.ok((await call("openlogi_macro_set", { id: "bad", name: "x", trigger: "F9", steps: [{ key: "Ctrl+Nope" }] })).error);
  assert.ok((await call("openlogi_macro_activate", { id: "nope" })).error);
  await call("openlogi_macro_activate", { id: null });
  assert.ok((await call("openlogi_macro_list")).json.macros.every((m) => !m.active));
  assert.ok(!(await call("openlogi_macro_delete", { id: "greet" })).error);

  r = await call("openlogi_paste_add_item", { category: "Emails", text: "a@b.com\nlinha 2" });
  assert.ok(!r.error, r.text);
  const cats = (await call("openlogi_paste_list")).json.categories;
  assert.deepEqual(cats[0].items, ["a@b.com\nlinha 2"]);
  assert.ok((await call("openlogi_paste_category", { action: "create", name: "Macro" })).error, "reserved");
  assert.ok(!(await call("openlogi_paste_category", { action: "rename", name: "Emails", new_name: "Mails" })).error);
  assert.ok(!(await call("openlogi_paste_remove_item", { category: "Mails", index: 1 })).error);
});

test("raw path set and delete", async () => {
  let r = await call("openlogi_config_set_raw", { path: "devices/unit:6be9d300/invert_scroll", value: true, reload: false });
  assert.ok(!r.error, r.text);
  assert.equal(cfg().devices["unit:6be9d300"].invert_scroll, true);
  r = await call("openlogi_config_set_raw", { path: "devices/unit:6be9d300/invert_scroll", delete: true, reload: false });
  assert.equal(cfg().devices["unit:6be9d300"].invert_scroll, undefined);
  assert.ok((await call("openlogi_config_set_raw", { path: "devices/unit:6be9d300/nonsense", value: 1, reload: false })).error);
});

test("hardware tools answer cleanly with or without an agent", async () => {
  const r = await call("openlogi_status");
  assert.match(r.text, /openlogi|agent_version/i);
});

test.after(async () => { await client.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
