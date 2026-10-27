// Configuration tools: everything stored in config.toml - buttons, gestures, long-press, wheel-hold,
// per-app profiles, keyboard F-key remaps, Actions Ring, per-device and app-wide settings.

import { z } from "zod";
import {
  readConfig, updateConfig, validateConfig, listBackups, restoreBackup, configPath, resolveConfigDevice,
  describeDevice, ensureDevice, ConfigError, SCHEMA_VERSION, APP_SETTING_DOCS,
} from "./config.js";
import {
  UNIT_ACTIONS, PAYLOAD_ACTIONS, COMMAND_CLASS_ACTIONS, MOUSE_BUTTONS, GESTURE_BUTTONS, WHEEL_HOLD_BUTTONS,
  GESTURE_DIRECTIONS, KNOWN_CONTROLS, RING_SLOTS, RING_ICONS, CAMERA_CONTROLS, KEYBOARD_TRIGGER_KEYS,
  parseChord, parseTrigger, parseButton, validateAction, validateBinding, validateRingEntry,
} from "./catalog.js";
import { reloadAgentConfig } from "./cli.js";
import { ok, fail, safe } from "./util.js";

const READ = { readOnlyHint: true, openWorldHint: false };
const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const deviceArg = z.string().optional().describe("Config device: exact key (e.g. 'unit:6be9d300'), or a substring of its key / custom name / model name. Omit to use the selected (or only) device. See openlogi_config_devices.");
const appArg = z.string().optional().describe("Per-application profile id (macOS bundle id, Linux app id, Windows 'exe:<file>.exe' or lower-cased exe path). Omit for the device's global bindings.");
const reloadArg = z.boolean().default(true).describe("After writing, ask the running agent to reload config.toml so it takes effect now.");
const dryRunArg = z.boolean().default(false).describe("Validate and preview the resulting file without writing anything.");
const allowCmd = z.boolean().default(false).describe("Required (true) to bind TypeText / RunShellCommand / RunAppleScript / Workflow: they make a button press type text or run commands on this computer.");

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Run a config mutation, then optionally reload the agent. */
async function edit(summary, mutator, { reload, dry_run }) {
  const res = updateConfig(mutator, { dryRun: dry_run });
  if (dry_run) return ok({ dry_run: true, would_change: res.changed, summary, result: res.result, preview: res.preview });
  const out = { summary, changed: res.changed, file: res.file, backup: res.backup, result: res.result };
  if (res.changed && reload) {
    try { out.reload = await reloadAgentConfig(); } catch (e) { out.reload = { ok: false, reason: e.message }; }
  } else if (!res.changed) out.note = "no change - the file already had these values";
  return ok(out);
}

function requireButton(name) {
  const b = parseButton(name);
  if (!b.ok) throw new ConfigError(b.error);
  return b;
}

function devKey(data, selector) {
  return resolveConfigDevice(data, selector);
}

function guardCommand(isCommand, allow) {
  if (isCommand && !allow) {
    throw new ConfigError("This action can type text or run commands when a button is pressed. Re-run with allow_command_actions=true if the user explicitly asked for it.");
  }
}

function pruneEmpty(obj, key) {
  if (obj[key] && isObj(obj[key]) && Object.keys(obj[key]).length === 0) delete obj[key];
}

export function registerConfigTools(server) {
  // ------------------------------------------------------------------ catalogs (read-only)

  server.registerTool(
    "openlogi_list_actions",
    {
      title: "Action catalog",
      description: "Every action a button/gesture/ring slot can be bound to: payload-free names grouped by category, and payload actions with their JSON shapes (CustomShortcut, HoldShortcut, TapKeyHoldingModifiers, OpenApplication, SetDpiPreset, TypeText, RunShellCommand, RunAppleScript, Workflow). Chord grammar: modifiers Cmd (primary: Cmd on macOS, Ctrl elsewhere), Ctrl, Alt, Shift, Super/Win/Meta + one key (A-Z, 0-9, F1-F20, Enter, Escape, Backspace, Tab, Space, Home, End, PageUp, PageDown, Delete, arrows, - = [ ] \\ ; ' ` , . /).",
      inputSchema: { category: z.string().optional().describe("Filter by category: Mouse, Editing, Browser, Navigation, System, Media, Dpi, Scroll") },
      annotations: READ,
    },
    safe(async ({ category }) => {
      const groups = {};
      for (const [name, [label, cat]] of Object.entries(UNIT_ACTIONS)) {
        if (category && cat.toLowerCase() !== category.toLowerCase()) continue;
        (groups[cat] ??= []).push({ name, label });
      }
      return ok({ unit_actions: groups, payload_actions: category ? undefined : PAYLOAD_ACTIONS, command_class: [...COMMAND_CLASS_ACTIONS] });
    }),
  );

  server.registerTool(
    "openlogi_list_buttons",
    {
      title: "Rebindable controls",
      description: "All rebindable mouse controls with notes (which support gesture mode / wheel-hold) and every named keyboard control (HID++ 0x1b04 CID). Any other divertable key is addressed as control:0x<cid> (find the CID with openlogi_diag kind=controls).",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => ok({
      mouse_buttons: Object.entries(MOUSE_BUTTONS).map(([name, note]) => ({ name, note, gesture_mode: GESTURE_BUTTONS.has(name), wheel_hold: WHEEL_HOLD_BUTTONS.has(name) })),
      gesture_directions: GESTURE_DIRECTIONS,
      keyboard_controls: KNOWN_CONTROLS.map(({ name, hex, label }) => ({ name, cid: hex, label })),
      raw_form: "control:0x<cid>  e.g. control:0x01f3",
      global_keyboard_triggers: { keys: KEYBOARD_TRIGGER_KEYS, modifiers: ["shift", "control|ctrl", "option|alt", "command|cmd"], example: "shift+command+f5" },
    })),
  );

  server.registerTool(
    "openlogi_list_settings",
    {
      title: "Settings reference",
      description: "Reference of every app-wide setting (with allowed values) and every per-device setting key with its type/range, plus Actions Ring slots/icons and camera control names.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => ok({
      schema_version: SCHEMA_VERSION,
      app_settings: APP_SETTING_DOCS,
      device_settings: {
        enabled: "boolean - false leaves the device completely native",
        custom_name: "string alias",
        dpi: "integer DPI (re-applied on reconnect)",
        dpi_presets: "integer[] used by CycleDpiPresets / SetDpiPreset",
        thumbwheel_sensitivity: "1-100 (14 = 1x) per-device override",
        invert_scroll: "boolean - invert native vertical wheel",
        scroll_resolution: "'low' | 'high' (HID++ 0x2121)",
        smooth_wheel: "boolean - software-eased wheel scrolling",
        smartshift: "{ mode: 'free'|'ratchet', auto_disengage: 8-255, tunable_torque?: 0-100 }",
        lighting: "{ enabled, color: 'RRGGBB', brightness: 0-100 } (RGB keyboards)",
        light: "{ enabled, auto_camera?, brightness_percent: 0-100, temperature_kelvin?, color? } (Litra)",
        report_rate: "integer Hz",
        fn_lock: "boolean (keyboards)",
        keep_os_layout: "boolean (keyboards)",
        host_switch_targets: "string[] of device keys that follow this keyboard's host switch",
        camera_controls: "{ control: int } (webcams)",
        camera_profiles: "{ name: { control: int } }",
        camera_profile: "string - last applied profile",
      },
      action_ring: { slots: RING_SLOTS, icons: RING_ICONS, entry: "{ action, icon?, label? }; None and ShowActionsRing are not allowed inside a slot" },
      camera_controls: CAMERA_CONTROLS,
    })),
  );

  server.registerTool(
    "openlogi_validate_shortcut",
    {
      title: "Validate a shortcut or trigger",
      description: "Parse a keyboard chord (for CustomShortcut / HoldShortcut / TapKeyHoldingModifiers) and/or a global key trigger (for keyboard bindings) and return the canonical form or the exact error.",
      inputSchema: { chord: z.string().optional(), trigger: z.string().optional().describe("e.g. 'shift+command+f5'") },
      annotations: READ,
    },
    safe(async ({ chord, trigger }) => {
      if (chord === undefined && trigger === undefined) return fail("give chord and/or trigger");
      return ok({ chord: chord === undefined ? undefined : parseChord(chord), trigger: trigger === undefined ? undefined : parseTrigger(trigger) });
    }),
  );

  server.registerTool(
    "openlogi_validate_binding",
    {
      title: "Validate a binding",
      description: "Check a binding value for a button without touching config.toml. Binding shapes: Action (\"Copy\" or { CustomShortcut: \"Ctrl+C\" }); long-press { short, long }; wheel-hold { click, wheel: \"HorizontalScroll\" } (Back/Forward only); gesture map { Up, Down, Left, Right, Click } (Back, Forward, DpiToggle, GestureButton, HapticPanel).",
      inputSchema: { button: z.string(), binding: z.any() },
      annotations: READ,
    },
    safe(async ({ button, binding }) => {
      const b = requireButton(button);
      const v = validateBinding(b.name, binding);
      return v.ok ? ok({ valid: true, button: b.name, shape: v.shape, normalized: v.binding, runs_commands: v.command }) : ok({ valid: false, error: v.error });
    }),
  );

  // ------------------------------------------------------------------ read config

  server.registerTool(
    "openlogi_config_info",
    {
      title: "Config overview",
      description: "Where config.toml lives, whether it exists/parses/validates, schema version, selected device, app settings, and a summary of each configured device (key, name, kind, binding counts, per-app profiles).",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => {
      const cfg = readConfig();
      const problems = validateConfig({ schema_version: SCHEMA_VERSION, ...cfg.data });
      const devices = cfg.data.devices ?? {};
      return ok({
        file: cfg.file, exists: cfg.exists, schema_version: cfg.data.schema_version, valid: problems.length === 0, problems,
        selected_device: cfg.data.selected_device ?? null,
        app_settings: cfg.data.app_settings ?? {},
        keyboard_bindings: Object.keys(cfg.data.keyboard?.bindings ?? {}).length,
        devices: Object.keys(devices).map((k) => ({
          key: k, name: devices[k].custom_name ?? devices[k].identity?.display_name ?? null, kind: devices[k].identity?.kind ?? null,
          bindings: Object.keys(devices[k].bindings ?? {}).length, per_app_profiles: Object.keys(devices[k].per_app_bindings ?? {}),
          dpi: devices[k].dpi ?? null,
        })),
        backups: listBackups().length,
      });
    }),
  );

  server.registerTool(
    "openlogi_config_devices",
    {
      title: "Configured devices",
      description: "List the device entries in config.toml (keys are physical identities like unit:<hex>, serial:<s>, receiver:<id>:slot:<n>). Use these keys / names for the `device` argument of the config tools.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => {
      const cfg = readConfig();
      const devices = cfg.data.devices ?? {};
      return ok({ selected_device: cfg.data.selected_device ?? null, devices: Object.keys(devices).map((k) => ({ key: k, description: describeDevice(devices, k), capabilities: devices[k].identity?.capabilities ?? null, links: Object.keys(devices[k].links ?? {}) })) });
    }),
  );

  server.registerTool(
    "openlogi_config_read",
    {
      title: "Read config.toml",
      description: "Return the parsed config (whole, or one section / one device) or the raw TOML text.",
      inputSchema: {
        section: z.enum(["all", "app_settings", "keyboard", "devices"]).default("all"),
        device: deviceArg,
        raw: z.boolean().default(false).describe("Return the raw file text instead of parsed JSON."),
      },
      annotations: READ,
    },
    safe(async ({ section, device, raw }) => {
      const cfg = readConfig();
      if (raw) return ok(cfg.raw || "(config.toml does not exist yet)");
      if (device) { const k = devKey(cfg.data, device); return ok({ key: k, config: cfg.data.devices[k] }); }
      return ok(section === "all" ? cfg.data : (cfg.data[section] ?? {}));
    }),
  );

  server.registerTool(
    "openlogi_config_validate",
    {
      title: "Validate config.toml",
      description: "Run strict validation on the current file (unknown fields, ranges, enums). The OpenLogi app refuses to load a file that fails these checks.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => { const cfg = readConfig(); const problems = validateConfig(cfg.data); return ok({ valid: problems.length === 0, problems }); }),
  );

  server.registerTool(
    "openlogi_list_bindings",
    {
      title: "List bindings",
      description: "Show a device's bindings: global, per-application profiles, stashed gesture maps, and the Actions Ring layouts. Filter by app.",
      inputSchema: { device: deviceArg, app: appArg, include_ring: z.boolean().default(true) },
      annotations: READ,
    },
    safe(async ({ device, app, include_ring }) => {
      const cfg = readConfig();
      const key = devKey(cfg.data, device);
      const d = cfg.data.devices[key];
      if (app) return ok({ device: key, app, bindings: d.per_app_bindings?.[app] ?? {} });
      return ok({ device: key, bindings: d.bindings ?? {}, per_app_bindings: d.per_app_bindings ?? {}, disabled_gestures: d.disabled_gestures ?? {}, action_ring: include_ring ? d.action_ring ?? null : undefined });
    }),
  );

  // ------------------------------------------------------------------ bindings

  server.registerTool(
    "openlogi_set_binding",
    {
      title: "Bind a button",
      description: "Assign what a mouse button or keyboard key does. `binding` may be: an Action (\"MissionControl\", { CustomShortcut: \"Ctrl+Shift+P\" }, { HoldShortcut: \"Ctrl+Space\" }, { TapKeyHoldingModifiers: \"Cmd+Tab\" }, { OpenApplication: { path, display_name } }, ...); a long-press pair { short, long } (500 ms threshold); wheel-hold { click, wheel: \"HorizontalScroll\" } on Back/Forward; or a gesture map { Up, Down, Left, Right, Click } on Back/Forward/DpiToggle/GestureButton/HapticPanel. With `app`, sets a per-application override instead (single Action only). Binding None on a keyboard key removes it (the key keeps its firmware function). Use openlogi_list_actions / openlogi_list_buttons for valid names.",
      inputSchema: { device: deviceArg, button: z.string().describe("Mouse button (Back, Forward, MiddleClick, DpiToggle, Thumbwheel, GestureButton, ...) or keyboard control (KeySearch, control:0x01f3, ...)"), binding: z.any(), app: appArg, allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, button, binding, app, allow_command_actions, reload, dry_run }) => {
      const b = requireButton(button);
      let v;
      if (app) {
        v = validateAction(binding);
        if (!v.ok) throw new ConfigError(`per-app bindings take a single Action: ${v.error}`);
        v = { ok: true, binding: v.action, command: v.command, shape: "single" };
      } else {
        v = validateBinding(b.name, binding);
        if (!v.ok) throw new ConfigError(v.error);
      }
      guardCommand(v.command, allow_command_actions);
      return edit(`${b.name}${app ? ` @ ${app}` : ""} -> ${JSON.stringify(v.binding)}`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        const removeKey = b.kind === "key" && v.binding === "None";
        if (app) {
          d.per_app_bindings ??= {};
          d.per_app_bindings[app] ??= {};
          if (removeKey) delete d.per_app_bindings[app][b.name]; else d.per_app_bindings[app][b.name] = v.binding;
          pruneEmpty(d.per_app_bindings, app); pruneEmpty(d, "per_app_bindings");
        } else {
          d.bindings ??= {};
          // A control may be named only one way; drop the alternate spelling if present.
          if (b.kind === "key" && b.cid) for (const k of Object.keys(d.bindings)) if (k !== b.name && parseButton(k).ok && parseButton(k).cid === b.cid) delete d.bindings[k];
          if (removeKey) delete d.bindings[b.name]; else d.bindings[b.name] = v.binding;
          pruneEmpty(d, "bindings");
        }
        return { device: key, button: b.name, app: app ?? null, shape: v.shape, binding: v.binding, removed: removeKey || undefined };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_remove_binding",
    {
      title: "Remove a binding",
      description: "Delete a button's binding (global, or its per-app override with `app`). A mouse button with no entry falls back to OpenLogi's default; a keyboard key keeps its firmware function.",
      inputSchema: { device: deviceArg, button: z.string(), app: appArg, reload: reloadArg, dry_run: dryRunArg },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ device, button, app, reload, dry_run }) => {
      const b = requireButton(button);
      return edit(`remove ${b.name}${app ? ` @ ${app}` : ""}`, (data) => {
        const key = devKey(data, device);
        const d = data.devices[key];
        let removed = false;
        if (app) {
          if (d.per_app_bindings?.[app] && b.name in d.per_app_bindings[app]) { delete d.per_app_bindings[app][b.name]; removed = true; }
          if (d.per_app_bindings) { pruneEmpty(d.per_app_bindings, app); pruneEmpty(d, "per_app_bindings"); }
        } else {
          if (d.bindings && b.name in d.bindings) { delete d.bindings[b.name]; removed = true; }
          if (d.disabled_gestures?.[b.name]) { delete d.disabled_gestures[b.name]; pruneEmpty(d, "disabled_gestures"); }
          pruneEmpty(d, "bindings");
        }
        return { device: key, button: b.name, app: app ?? null, removed };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_remove_app_profile",
    {
      title: "Delete a per-app profile",
      description: "Remove a whole per-application button overlay (and optionally that app's Actions Ring layout) from a device.",
      inputSchema: { device: deviceArg, app: z.string(), include_ring: z.boolean().default(true), reload: reloadArg, dry_run: dryRunArg },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ device, app, include_ring, reload, dry_run }) => edit(`remove app profile ${app}`, (data) => {
      const key = devKey(data, device);
      const d = data.devices[key];
      const had = { bindings: !!d.per_app_bindings?.[app], ring: !!d.action_ring?.per_app?.[app] };
      if (d.per_app_bindings) { delete d.per_app_bindings[app]; pruneEmpty(d, "per_app_bindings"); }
      if (include_ring && d.action_ring?.per_app) delete d.action_ring.per_app[app];
      return { device: key, app, removed: had };
    }, { reload, dry_run })),
  );

  server.registerTool(
    "openlogi_set_gesture",
    {
      title: "Set a gesture direction",
      description: "Set one direction (Up/Down/Left/Right/Click) of a button's gesture map. The button must already be in gesture mode, or pass enable_gesture_mode=true to convert it (its current single action becomes Click; other directions start as None until set).",
      inputSchema: { device: deviceArg, button: z.enum(["Back", "Forward", "DpiToggle", "GestureButton", "HapticPanel"]), direction: z.enum(["Up", "Down", "Left", "Right", "Click"]), action: z.any(), enable_gesture_mode: z.boolean().default(false), allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, button, direction, action, enable_gesture_mode, allow_command_actions, reload, dry_run }) => {
      const a = validateAction(action);
      if (!a.ok) throw new ConfigError(a.error);
      guardCommand(a.command, allow_command_actions);
      return edit(`${button}.${direction} -> ${JSON.stringify(a.action)}`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        d.bindings ??= {};
        let map = d.bindings[button];
        const isMap = isObj(map) && Object.keys(map).every((k) => GESTURE_DIRECTIONS.includes(k)) && Object.keys(map).length > 0;
        if (!isMap) {
          if (!enable_gesture_mode) throw new ConfigError(`${button} is not in gesture mode; pass enable_gesture_mode=true to convert it`);
          map = toGestureMap(d, button, map);
        }
        map[direction] = a.action;
        d.bindings[button] = map;
        return { device: key, button, gesture_map: map };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_set_gesture_mode",
    {
      title: "Turn gesture mode on/off",
      description: "Enable or disable gesture mode on a button. Disabling keeps the direction map stashed (disabled_gestures) and demotes the button to its Click action; enabling restores the stashed map (or builds one from the current action as Click). Optionally pass `directions` to set arms at the same time.",
      inputSchema: { device: deviceArg, button: z.enum(["Back", "Forward", "DpiToggle", "GestureButton", "HapticPanel"]), enabled: z.boolean(), directions: z.record(z.string(), z.any()).optional().describe("e.g. { Up: \"MissionControl\", Down: \"AppExpose\", Left: \"PreviousDesktop\", Right: \"NextDesktop\" }"), allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, button, enabled, directions, allow_command_actions, reload, dry_run }) => {
      const dirs = {};
      for (const [dir, act] of Object.entries(directions ?? {})) {
        if (!GESTURE_DIRECTIONS.includes(dir)) throw new ConfigError(`unknown direction '${dir}'`);
        const a = validateAction(act);
        if (!a.ok) throw new ConfigError(`${dir}: ${a.error}`);
        guardCommand(a.command, allow_command_actions);
        dirs[dir] = a.action;
      }
      return edit(`${button} gesture mode ${enabled ? "on" : "off"}`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        d.bindings ??= {};
        const cur = d.bindings[button];
        const isMap = isObj(cur) && Object.keys(cur).length > 0 && Object.keys(cur).every((k) => GESTURE_DIRECTIONS.includes(k));
        if (enabled) {
          const map = isMap ? cur : toGestureMap(d, button, cur);
          Object.assign(map, dirs);
          d.bindings[button] = map;
        } else if (isMap) {
          d.disabled_gestures ??= {};
          d.disabled_gestures[button] = cur;
          d.bindings[button] = cur.Click ?? "None";
        }
        return { device: key, button, binding: d.bindings[button] };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_set_long_press",
    {
      title: "Short-press / long-press pair",
      description: "Give a button independent actions for a short press (<500 ms) and a long press (held >= 500 ms, fires once). `long` may be a HoldShortcut to hold a chord from the threshold until release. Applies to the device's global bindings only.",
      inputSchema: { device: deviceArg, button: z.string(), short: z.any(), long: z.any(), allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, button, short, long, allow_command_actions, reload, dry_run }) => {
      const b = requireButton(button);
      const v = validateBinding(b.name, { short, long });
      if (!v.ok) throw new ConfigError(v.error);
      guardCommand(v.command, allow_command_actions);
      return edit(`${b.name} short/long`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        (d.bindings ??= {})[b.name] = v.binding;
        return { device: key, button: b.name, binding: v.binding };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_set_wheel_hold",
    {
      title: "Hold button + wheel = sideways scroll",
      description: "On Back/Forward, turn the main wheel into a virtual thumb wheel while the button is held (like Options+ on mice without a thumb wheel). Releasing without turning fires `click`. Needs raw-wheel support on that button and the mouse hook. enabled=false restores a plain single action (the click).",
      inputSchema: { device: deviceArg, button: z.enum(["Back", "Forward"]), click: z.any().optional().describe("Action fired when the button is released without scrolling (default: BrowserBack/BrowserForward)"), enabled: z.boolean().default(true), allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, button, click, enabled, allow_command_actions, reload, dry_run }) => {
      const clickAction = click ?? (button === "Back" ? "BrowserBack" : "BrowserForward");
      const a = validateAction(clickAction);
      if (!a.ok) throw new ConfigError(`click: ${a.error}`);
      guardCommand(a.command, allow_command_actions);
      return edit(`${button} wheel-hold ${enabled ? "on" : "off"}`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        (d.bindings ??= {})[button] = enabled ? { click: a.action, wheel: "HorizontalScroll" } : a.action;
        return { device: key, button, binding: d.bindings[button] };
      }, { reload, dry_run });
    }),
  );

  // ------------------------------------------------------------------ global keyboard F-key remaps

  server.registerTool(
    "openlogi_set_keyboard_binding",
    {
      title: "Global key remap",
      description: "Remap a global keyboard trigger (independent of any device) via [keyboard.bindings]: F-keys / Esc with optional modifiers, e.g. trigger 'f1' or 'shift+command+f5' -> any Action (power actions like typed text, key combos and workflows need allow_command_actions only for text/command ones). macOS and Windows.",
      inputSchema: { trigger: z.string(), action: z.any(), allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ trigger, action, allow_command_actions, reload, dry_run }) => {
      const t = parseTrigger(trigger);
      if (!t.ok) throw new ConfigError(t.error);
      const a = validateAction(action);
      if (!a.ok) throw new ConfigError(a.error);
      guardCommand(a.command, allow_command_actions);
      return edit(`${t.canonical} -> ${JSON.stringify(a.action)}`, (data) => {
        data.keyboard ??= {};
        data.keyboard.bindings ??= {};
        for (const k of Object.keys(data.keyboard.bindings)) { const p = parseTrigger(k); if (p.ok && p.canonical === t.canonical) delete data.keyboard.bindings[k]; }
        data.keyboard.bindings[t.canonical] = a.action;
        return { trigger: t.canonical, action: a.action };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_remove_keyboard_binding",
    {
      title: "Remove a global key remap",
      description: "Delete a [keyboard.bindings] trigger (or all of them with all=true).",
      inputSchema: { trigger: z.string().optional(), all: z.boolean().default(false), reload: reloadArg, dry_run: dryRunArg },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ trigger, all, reload, dry_run }) => {
      if (!all && !trigger) throw new ConfigError("give a trigger or all=true");
      const t = trigger ? parseTrigger(trigger) : null;
      if (t && !t.ok) throw new ConfigError(t.error);
      return edit(all ? "clear keyboard bindings" : `remove ${t.canonical}`, (data) => {
        const b = data.keyboard?.bindings ?? {};
        const removed = [];
        for (const k of Object.keys(b)) {
          const p = parseTrigger(k);
          if (all || (p.ok && p.canonical === t.canonical)) { delete b[k]; removed.push(k); }
        }
        if (data.keyboard && Object.keys(b).length === 0) delete data.keyboard;
        return { removed };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_list_keyboard_bindings",
    {
      title: "List global key remaps",
      description: "Show [keyboard.bindings].",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => ok(readConfig().data.keyboard?.bindings ?? {})),
  );

  // ------------------------------------------------------------------ Actions Ring

  server.registerTool(
    "openlogi_get_action_ring",
    {
      title: "Read Actions Ring",
      description: "Return a device's Actions Ring settings and layouts (default + per-app). The ring is an eight-slot cursor-centred overlay opened by binding ShowActionsRing to a button.",
      inputSchema: { device: deviceArg },
      annotations: READ,
    },
    safe(async ({ device }) => { const cfg = readConfig(); const k = devKey(cfg.data, device); return ok({ device: k, slots: RING_SLOTS, action_ring: cfg.data.devices[k].action_ring ?? { enabled: true, haptics: true, default: {} } }); }),
  );

  server.registerTool(
    "openlogi_set_ring_slot",
    {
      title: "Set an Actions Ring slot",
      description: `Place an action in one of the eight ring slots (${RING_SLOTS.join(", ")}). entry is an Action or { action, icon?, label? }. Icons: ${RING_ICONS.join(", ")}. With app, edits that application's complete layout instead of the default (the per-app layout replaces the default entirely for that app).`,
      inputSchema: { device: deviceArg, slot: z.enum(RING_SLOTS), entry: z.any(), app: appArg, allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, slot, entry, app, allow_command_actions, reload, dry_run }) => {
      const e = validateRingEntry(entry);
      if (!e.ok) throw new ConfigError(e.error);
      guardCommand(e.command, allow_command_actions);
      const stored = Object.keys(e.entry).length === 1 ? e.entry.action : e.entry;
      return edit(`ring ${slot}${app ? ` @ ${app}` : ""}`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        d.action_ring ??= {};
        const layout = app ? ((d.action_ring.per_app ??= {})[app] ??= {}) : (d.action_ring.default ??= {});
        (layout.slots ??= {})[slot] = stored;
        return { device: key, app: app ?? null, slot, entry: stored };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_clear_ring_slot",
    {
      title: "Clear ring slot(s)",
      description: "Empty one slot, or all slots of a layout (default or a per-app one). With app and no slot, deletes that app's whole layout.",
      inputSchema: { device: deviceArg, slot: z.enum(RING_SLOTS).optional(), app: appArg, reload: reloadArg, dry_run: dryRunArg },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ device, slot, app, reload, dry_run }) => edit(`clear ring ${slot ?? "all"}${app ? ` @ ${app}` : ""}`, (data) => {
      const key = devKey(data, device);
      const ring = data.devices[key].action_ring;
      if (!ring) return { device: key, cleared: false };
      if (app) {
        if (!slot) delete ring.per_app?.[app];
        else if (ring.per_app?.[app]?.slots) delete ring.per_app[app].slots[slot];
        if (ring.per_app) pruneEmpty(ring, "per_app");
      } else if (slot) { if (ring.default?.slots) delete ring.default.slots[slot]; }
      else if (ring.default) ring.default.slots = {};
      return { device: key, cleared: true };
    }, { reload, dry_run })),
  );

  server.registerTool(
    "openlogi_set_ring_options",
    {
      title: "Actions Ring options",
      description: "Enable/disable the Actions Ring and haptic feedback for a device.",
      inputSchema: { device: deviceArg, enabled: z.boolean().optional(), haptics: z.boolean().optional(), reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, enabled, haptics, reload, dry_run }) => {
      if (enabled === undefined && haptics === undefined) throw new ConfigError("give enabled and/or haptics");
      return edit("ring options", (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        d.action_ring ??= {};
        if (enabled !== undefined) d.action_ring.enabled = enabled;
        if (haptics !== undefined) d.action_ring.haptics = haptics;
        return { device: key, action_ring: { enabled: d.action_ring.enabled, haptics: d.action_ring.haptics } };
      }, { reload, dry_run });
    }),
  );

  // ------------------------------------------------------------------ device & app settings

  server.registerTool(
    "openlogi_set_device_settings",
    {
      title: "Set device settings",
      description: "Merge saved per-device settings into config.toml (re-applied by the agent on reconnect). Keys: enabled, custom_name, dpi, dpi_presets, thumbwheel_sensitivity (1-100), invert_scroll, scroll_resolution (low|high), smooth_wheel, smartshift {mode, auto_disengage, tunable_torque}, lighting {enabled, color, brightness}, light {...}, report_rate, fn_lock, keep_os_layout, host_switch_targets, camera_controls, camera_profiles, camera_profile. Set a key to null to remove it. See openlogi_list_settings. For immediate hardware changes without saving use openlogi_dpi / openlogi_smartshift etc.",
      inputSchema: { device: deviceArg, settings: z.record(z.string(), z.any()), reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, settings, reload, dry_run }) => {
      const managed = ["bindings", "per_app_bindings", "disabled_gestures", "action_ring", "identity", "links"];
      const bad = Object.keys(settings).filter((k) => managed.includes(k));
      if (bad.length) throw new ConfigError(`${bad.join(", ")} cannot be set here: use the binding / gesture / ring tools (identity and links are managed by OpenLogi itself)`);
      return edit(`device settings: ${Object.keys(settings).join(", ")}`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        for (const [k, v] of Object.entries(settings)) { if (v === null) delete d[k]; else d[k] = v; }
        return { device: key, applied: settings };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_set_dpi_presets",
    {
      title: "DPI presets",
      description: "Set the DPI preset list used by CycleDpiPresets / SetDpiPreset (and optionally the active saved DPI). Empty list removes the presets.",
      inputSchema: { device: deviceArg, presets: z.array(z.number().int().positive()), dpi: z.number().int().positive().optional(), reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, presets, dpi, reload, dry_run }) => edit("dpi presets", (data) => {
      const key = devKey(data, device);
      const d = ensureDevice(data, key);
      if (presets.length) d.dpi_presets = presets; else delete d.dpi_presets;
      if (dpi !== undefined) d.dpi = dpi;
      return { device: key, dpi_presets: d.dpi_presets ?? [], dpi: d.dpi ?? null };
    }, { reload, dry_run })),
  );

  server.registerTool(
    "openlogi_set_app_settings",
    {
      title: "Set app settings",
      description: "Merge app-wide preferences into [app_settings]: launch_at_login, check_for_updates, auto_install_updates, show_in_menu_bar, capture_mouse_events (master switch for button remapping), smooth_scroll, vertical_scroll_sensitivity (1-100, 14 = 1x), thumbwheel_sensitivity (1-100), mouse_profile_target (pointer|focused), asset_source, auto_download_assets, language, appearance, ui_scale, device_view_mode, theme_light/theme_dark, ui_radius, app_icon. null removes a key. Some take effect after an agent restart.",
      inputSchema: { settings: z.record(z.string(), z.any()), reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ settings, reload, dry_run }) => edit(`app settings: ${Object.keys(settings).join(", ")}`, (data) => {
      data.app_settings ??= {};
      for (const [k, v] of Object.entries(settings)) { if (v === null) delete data.app_settings[k]; else data.app_settings[k] = v; }
      if (Object.keys(data.app_settings).length === 0) delete data.app_settings;
      return { applied: settings };
    }, { reload, dry_run })),
  );

  server.registerTool(
    "openlogi_select_device",
    {
      title: "Select active device",
      description: "Set `selected_device` (the device shown/edited by default in the OpenLogi app).",
      inputSchema: { device: z.string(), reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, reload, dry_run }) => edit("select device", (data) => { const k = devKey(data, device); data.selected_device = k; return { selected_device: k }; }, { reload, dry_run })),
  );

  server.registerTool(
    "openlogi_save_camera_profile",
    {
      title: "Camera profiles",
      description: "Save, delete or mark-applied a named UVC camera profile (name -> {control: value}) on a camera device entry. To apply values to the hardware use openlogi_camera.",
      inputSchema: { device: deviceArg, action: z.enum(["save", "delete", "mark_applied"]), name: z.string(), controls: z.record(z.string(), z.number().int()).optional(), reload: reloadArg, dry_run: dryRunArg },
      annotations: EDIT,
    },
    safe(async ({ device, action, name, controls, reload, dry_run }) => {
      if (action === "save") {
        if (!controls || !Object.keys(controls).length) throw new ConfigError("save needs controls");
        const bad = Object.keys(controls).filter((c) => !CAMERA_CONTROLS.includes(c));
        if (bad.length) throw new ConfigError(`unknown camera controls: ${bad.join(", ")}`);
      }
      return edit(`camera profile ${action} ${name}`, (data) => {
        const key = devKey(data, device);
        const d = ensureDevice(data, key);
        if (action === "save") (d.camera_profiles ??= {})[name] = controls;
        else if (action === "delete") { delete d.camera_profiles?.[name]; pruneEmpty(d, "camera_profiles"); if (d.camera_profile === name) delete d.camera_profile; }
        else d.camera_profile = name;
        return { device: key, camera_profiles: d.camera_profiles ?? {}, camera_profile: d.camera_profile ?? null };
      }, { reload, dry_run });
    }),
  );

  server.registerTool(
    "openlogi_config_set_raw",
    {
      title: "Set any config value by path",
      description: "Escape hatch: set or delete any value in config.toml by dotted path (segments separated by '/', so device keys containing dots/colons stay intact), e.g. path 'devices/unit:6be9d300/dpi'. The whole file is re-validated against the strict schema before writing, so invalid fields are rejected. Prefer the dedicated tools.",
      inputSchema: { path: z.string().describe("Slash-separated path, e.g. app_settings/smooth_scroll"), value: z.any().optional(), delete: z.boolean().default(false), allow_command_actions: allowCmd, reload: reloadArg, dry_run: dryRunArg },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ path: p, value, delete: del, allow_command_actions, reload, dry_run }) => {
      const parts = p.split("/").filter(Boolean);
      if (!parts.length) throw new ConfigError("empty path");
      if (parts[0] === "schema_version") throw new ConfigError("schema_version cannot be changed here");
      if (!del && value === undefined) throw new ConfigError("give value or delete=true");
      if (!del && JSON.stringify(value).match(/RunShellCommand|RunAppleScript|TypeText|Workflow/) && !allow_command_actions) {
        throw new ConfigError("value contains a command-class action; re-run with allow_command_actions=true if the user explicitly asked for it.");
      }
      return edit(`${del ? "delete" : "set"} ${p}`, (data) => {
        let node = data;
        for (const seg of parts.slice(0, -1)) {
          if (!isObj(node[seg])) { if (del) return { deleted: false }; node[seg] = {}; }
          node = node[seg];
        }
        const last = parts[parts.length - 1];
        if (del) { const had = last in node; delete node[last]; return { deleted: had }; }
        node[last] = value;
        return { set: p, value };
      }, { reload, dry_run });
    }),
  );

  // ------------------------------------------------------------------ backups & reload

  server.registerTool(
    "openlogi_config_backups",
    {
      title: "List config backups",
      description: "List backups beside config.toml: this server's own (config.toml.mcp-backup.<timestamp>, one per write, newest 20 kept) and the GUI's rotating config.toml.backup.1-5.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => ok({ file: configPath(), backups: listBackups().map((b) => ({ kind: b.kind, name: b.name })) })),
  );

  server.registerTool(
    "openlogi_config_restore",
    {
      title: "Restore a config backup",
      description: "Replace config.toml with a backup (validated first; the current file is backed up before being replaced). Use openlogi_config_backups for names.",
      inputSchema: { name: z.string(), reload: reloadArg },
      annotations: { ...EDIT, destructiveHint: true },
    },
    safe(async ({ name, reload }) => {
      const res = restoreBackup(name);
      const out = { ...res };
      if (reload) { try { out.reload = await reloadAgentConfig(); } catch (e) { out.reload = { ok: false, reason: e.message }; } }
      return ok(out);
    }),
  );

  server.registerTool(
    "openlogi_reload_agent",
    {
      title: "Reload agent config",
      description: "Ask the running OpenLogi agent to re-read config.toml (after a hand edit). Uses `openlogi api reload` when the build has it; otherwise re-saves an online mouse's current DPI with --save, which makes the agent reload as a side effect.",
      inputSchema: {},
      annotations: EDIT,
    },
    safe(async () => ok(await reloadAgentConfig())),
  );
}

/** Build a gesture map from a button's stash or current single action (Click) - missing arms are None. */
function toGestureMap(d, button, current) {
  const stash = d.disabled_gestures?.[button];
  let map;
  if (isObj(stash)) {
    map = structuredClone(stash);
    delete d.disabled_gestures[button];
    pruneEmpty(d, "disabled_gestures");
  } else {
    map = {};
    for (const dir of GESTURE_DIRECTIONS) map[dir] = "None";
    if (current !== undefined && validateAction(current).ok) map.Click = current;
    else if (isObj(current) && "click" in current) map.Click = current.click;
    else if (isObj(current) && "short" in current) map.Click = current.short;
  }
  return map;
}
