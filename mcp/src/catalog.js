// Static vocabulary mirrored from crates/openlogi-core (binding/*, config/*).
// Keep in sync with: binding/action.rs, binding/button.rs, binding/control.rs,
// binding/gesture.rs, binding/action_ring*.rs, binding/key_combo.rs.

/** Payload-free actions: name -> [label, category]. Order follows Action::catalog(). */
export const UNIT_ACTIONS = {
  // Mouse
  LeftClick: ["Left Click", "Mouse"],
  RightClick: ["Right Click", "Mouse"],
  MiddleClick: ["Middle Click", "Mouse"],
  MouseBack: ["Back (Button 4) - real mouse button 4", "Mouse"],
  MouseForward: ["Forward (Button 5) - real mouse button 5", "Mouse"],
  // Editing
  Copy: ["Copy", "Editing"],
  Paste: ["Paste", "Editing"],
  Cut: ["Cut", "Editing"],
  Undo: ["Undo", "Editing"],
  Redo: ["Redo", "Editing"],
  SelectAll: ["Select All", "Editing"],
  Find: ["Find", "Editing"],
  Save: ["Save", "Editing"],
  // Browser
  BrowserBack: ["Browser Back (Cmd+[ style)", "Browser"],
  BrowserForward: ["Browser Forward", "Browser"],
  NewTab: ["New Tab", "Browser"],
  CloseTab: ["Close Tab", "Browser"],
  ReopenTab: ["Reopen Tab", "Browser"],
  NextTab: ["Next Tab", "Browser"],
  PrevTab: ["Previous Tab", "Browser"],
  ReloadPage: ["Reload Page", "Browser"],
  // Navigation
  MissionControl: ["Mission Control / Task View", "Navigation"],
  AppExpose: ["App Expose", "Navigation"],
  PreviousDesktop: ["Previous Desktop / Space", "Navigation"],
  NextDesktop: ["Next Desktop / Space", "Navigation"],
  ShowDesktop: ["Show Desktop", "Navigation"],
  LaunchpadShow: ["Launchpad", "Navigation"],
  // System
  None: ["Do Nothing (captures and suppresses the input)", "System"],
  LockScreen: ["Lock Screen", "System"],
  Screenshot: ["Screenshot", "System"],
  CaptureRegion: ["Capture Region to clipboard", "System"],
  Sleep: ["Sleep", "System"],
  ShowActionsRing: ["Actions Ring (not allowed inside a ring slot)", "System"],
  // Media
  PlayPause: ["Play / Pause", "Media"],
  NextTrack: ["Next Track", "Media"],
  PrevTrack: ["Previous Track", "Media"],
  VolumeUp: ["Volume Up", "Media"],
  VolumeDown: ["Volume Down", "Media"],
  MuteVolume: ["Mute", "Media"],
  // DPI
  CycleDpiPresets: ["Cycle DPI Presets", "Dpi"],
  ToggleSmartShift: ["Toggle SmartShift ratchet/free-spin", "Dpi"],
  // Scroll
  ScrollUp: ["Scroll Up", "Scroll"],
  ScrollDown: ["Scroll Down", "Scroll"],
  HorizontalScrollLeft: ["Scroll Left", "Scroll"],
  HorizontalScrollRight: ["Scroll Right", "Scroll"],
};

/** Actions with a payload: name -> description. */
export const PAYLOAD_ACTIONS = {
  SetDpiPreset: "{ SetDpiPreset: <0-based preset index> } - jump to a DPI preset (clamped to the preset list).",
  CustomShortcut: '{ CustomShortcut: "Ctrl+Shift+P" } - press the chord once (down+up).',
  HoldShortcut: '{ HoldShortcut: "Ctrl+Space" } - hold the chord while the button is held (push-to-talk).',
  TapKeyHoldingModifiers:
    '{ TapKeyHoldingModifiers: "Cmd+Tab" } - hold the modifiers while the button is held, tap the key once (app switcher).',
  OpenApplication:
    '{ OpenApplication: { path: "C:\\\\Windows\\\\notepad.exe", display_name: "Notepad" } } - open an app, folder, path or URL (a leading ~ is expanded).',
  TypeText: '{ TypeText: "hello" } - type a unicode string. (power-user, command-class)',
  RunShellCommand: '{ RunShellCommand: "cmd" } - run via the system shell. (power-user, command-class)',
  RunAppleScript: '{ RunAppleScript: "src" } - macOS osascript. (power-user, command-class)',
  Workflow:
    '{ Workflow: [ { TypeText: "x" }, { PressKey: "Enter" }, { Delay: { millis: 500 } }, { RunShellCommand: "..." }, { RunAppleScript: "..." } ] } - timed sequence. (power-user, command-class)',
};

/** Actions that can execute arbitrary text/commands. Require an explicit opt-in. */
export const COMMAND_CLASS_ACTIONS = new Set(["TypeText", "RunShellCommand", "RunAppleScript", "Workflow"]);

/** Mouse buttons (ButtonId::ALL) in physical front-to-side order. */
export const MOUSE_BUTTONS = {
  LeftClick: "Primary button. Rebindable in schema but the OS hook never suppresses it.",
  RightClick: "Secondary button. Same caveat as LeftClick.",
  MiddleClick: "Wheel click (OS hook remappable). Gesture-capable only if previously stored.",
  WheelTiltLeft: "Main wheel tilt left (CID 0x005b).",
  WheelTiltRight: "Main wheel tilt right (CID 0x005d).",
  Back: "Thumb-side back button (button 4). Supports gesture mode and wheel-hold.",
  Forward: "Thumb-side forward button (button 5). Supports gesture mode and wheel-hold.",
  DpiToggle: "ModeShift / DPI button under the wheel. Supports gesture mode (needs raw-XY).",
  Thumbwheel: "Thumb wheel capacitive tap/click. Inert unless bound.",
  ThumbwheelScrollUp: "Thumb wheel rotation, positive direction.",
  ThumbwheelScrollDown: "Thumb wheel rotation, negative direction.",
  GestureButton: "Dedicated gesture button on MX-line mice. Supports gesture mode.",
  HapticPanel: "MX Master 4 haptic sense panel (CID 0x01a0). Supports gesture mode.",
};

export const GESTURE_BUTTONS = new Set(["Back", "Forward", "DpiToggle", "GestureButton", "HapticPanel"]);
export const WHEEL_HOLD_BUTTONS = new Set(["Back", "Forward"]);
export const GESTURE_DIRECTIONS = ["Up", "Down", "Left", "Right", "Click"];

/** Keyboard controls known by name (HID++ 0x1b04 CID). Any other: control:0x<cid>. */
export const KNOWN_CONTROLS = [
  [0x00c7, "KeyBrightnessDown", "Brightness Down Key"],
  [0x00c8, "KeyBrightnessUp", "Brightness Up Key"],
  [0x00e2, "KeyBacklightDown", "Backlight Down Key"],
  [0x00e3, "KeyBacklightUp", "Backlight Up Key"],
  [0x00e0, "KeyMissionControl", "Mission Control Key"],
  [0x00e1, "KeyLaunchpad", "Launchpad Key"],
  [0x006e, "KeyShowDesktop", "Show Desktop Key"],
  [0x00d4, "KeySearch", "Search Key"],
  [0x0103, "KeyDictation", "Dictation Key"],
  [0x0108, "KeyEmoji", "Emoji Key"],
  [0x010a, "KeyScreenCapture", "Screen Capture Key"],
  [0x00bf, "KeyPrintScreen", "Print Screen Key"],
  [0x011c, "KeyMicMute", "Mic Mute Key"],
  [0x00e4, "KeyPreviousTrack", "Previous Track Key"],
  [0x00e5, "KeyPlayPause", "Play/Pause Key"],
  [0x0141, "KeyPlayPauseTrack", "Play/Pause Key (track)"],
  [0x00e6, "KeyNextTrack", "Next Track Key"],
  [0x00e7, "KeyMute", "Mute Key"],
  [0x00e8, "KeyVolumeDown", "Volume Down Key"],
  [0x00e9, "KeyVolumeUp", "Volume Up Key"],
  [0x000a, "KeyCalculator", "Calculator Key"],
  [0x006f, "KeyLock", "Lock Key"],
  [0x011d, "KeyDoNotDisturb", "Do Not Disturb Key"],
  [0x0104, "KeyEmojiHeartEyes", "Heart-Eyes Emoji Key"],
  [0x0105, "KeyEmojiCrying", "Crying Emoji Key"],
  [0x0106, "KeyEmojiSmiley", "Smiley Emoji Key"],
  [0x0107, "KeyEmojiTears", "Tears-of-Joy Emoji Key"],
  [0x00ea, "KeyLookUp", "Look Up Key"],
  [0x0100, "KeyAppSwitch", "App Switch Key"],
  [0x0109, "KeyAppSwitchLaunchpad", "App Switch / Launchpad Key"],
  [0x0118, "KeyHome", "Home Key"],
  [0x0119, "KeyEnd", "End Key"],
  [0x011a, "KeyPageUp", "Page Up Key"],
  [0x011b, "KeyPageDown", "Page Down Key"],
  [0x00ba, "KeyMultiPlatformAppSwitch", "App Switch Key (multiplatform)"],
  [0x00bb, "KeyMultiPlatformHome", "Home Key (multiplatform)"],
  [0x00bc, "KeyMultiPlatformMenu", "Menu Key (multiplatform)"],
  [0x00be, "KeyMultiPlatformInsert", "Insert Key (multiplatform)"],
  [0x00dd, "KeyLanguageSwitch", "Language Switch Key"],
  [0x01a3, "KeyCircle", "Circle Key"],
  [0x01a4, "KeyTriangle", "Triangle Key"],
  [0x01a5, "KeyDiamond", "Diamond Key"],
  [0x01a6, "KeyStar", "Star Key"],
].map(([cid, name, label]) => ({ cid, name, label, hex: "0x" + cid.toString(16).padStart(4, "0") }));

export const RING_SLOTS = ["Top", "TopRight", "Right", "BottomRight", "Bottom", "BottomLeft", "Left", "TopLeft"];

export const RING_ICONS = [
  "Pointer", "Mouse", "Copy", "Paste", "Cut", "Search", "Save", "Keyboard", "Applications", "Grid", "Layers",
  "Monitor", "Lock", "Camera", "Play", "Volume", "Gauge", "Refresh", "ArrowUp", "ArrowDown", "ArrowLeft",
  "ArrowRight", "Undo", "Redo", "SelectAll", "MouseBack", "MouseForward", "NewTab", "CloseTab", "ReopenTab",
  "NextTab", "PreviousTab", "Reload", "PreviousDesktop", "NextDesktop", "PreviousTrack", "NextTrack",
  "VolumeDown", "Mute", "ScrollLeft", "ScrollRight", "Folder", "File", "Globe", "Terminal", "Settings", "Star",
  "Heart", "Calendar", "Bell", "User", "Palette", "Book", "Ban",
];

export const CAMERA_CONTROLS = [
  "zoom", "pan", "tilt", "focus", "exposure", "power_line_frequency", "low_light_compensation", "brightness",
  "contrast", "saturation", "sharpness", "gain", "backlight_compensation", "white_balance", "tint",
  "focus_auto", "exposure_auto", "white_balance_auto",
];

export const KEYBOARD_TRIGGER_KEYS = ["esc", ...Array.from({ length: 19 }, (_, i) => `f${i + 1}`)];

// ---- Shortcut chord parsing (mirror of KeyCombo::from_str) ---------------------------------

const MODIFIERS = {
  cmd: "Cmd", command: "Cmd", super: "Super", win: "Super", meta: "Super", shift: "Shift",
  ctrl: "Ctrl", control: "Ctrl", alt: "Alt", option: "Alt",
};
const NAMED_KEYS = {
  enter: "Enter", return: "Enter", escape: "Escape", esc: "Escape", backspace: "Backspace", tab: "Tab",
  space: "Space", home: "Home", pageup: "PageUp", "page-up": "PageUp", delete: "Delete", end: "End",
  pagedown: "PageDown", "page-down": "PageDown", right: "Right", left: "Left", down: "Down", up: "Up",
};
const SYMBOL_KEYS = new Set(["-", "=", "[", "]", "\\", ";", "'", "`", ",", ".", "/"]);
const MOD_ORDER = ["Cmd", "Super", "Ctrl", "Alt", "Shift"];

/** Parse a chord. Returns { ok, canonical, modifiers, key } or { ok:false, error }. */
export function parseChord(input) {
  const text = String(input ?? "").trim();
  if (!text) return { ok: false, error: "keyboard shortcut must not be empty" };
  const mods = new Set();
  let key = null;
  for (const raw of text.split("+")) {
    const token = raw.trim();
    if (!token) return { ok: false, error: `unsupported shortcut token: '${raw}'` };
    const mod = MODIFIERS[token.toLowerCase()];
    if (mod) { mods.add(mod); continue; }
    if (key !== null) return { ok: false, error: "keyboard shortcut must contain exactly one key" };
    const lower = token.toLowerCase();
    if (lower.length === 1 && /[a-z]/.test(lower)) key = lower.toUpperCase();
    else if (lower.length === 1 && /[0-9]/.test(lower)) key = lower;
    else if (lower.length === 1 && SYMBOL_KEYS.has(lower)) key = lower;
    else if (/^f\d+$/.test(lower)) {
      const n = Number(lower.slice(1));
      if ((n >= 1 && n <= 12) || (n >= 13 && n <= 20)) key = `F${n}`;
      else return { ok: false, error: `unsupported shortcut token: '${token}'` };
    } else if (NAMED_KEYS[lower]) key = NAMED_KEYS[lower];
    else return { ok: false, error: `unsupported shortcut token: '${token}'` };
  }
  if (key === null) return { ok: false, error: "keyboard shortcut must contain a key" };
  const ordered = MOD_ORDER.filter((m) => mods.has(m));
  return { ok: true, modifiers: ordered, key, canonical: [...ordered, key].join("+") };
}

/** Parse a keyboard-trigger string such as "shift+command+f5" (global F-key remapping). */
export function parseTrigger(input) {
  const aliases = { shift: "shift", control: "control", ctrl: "control", option: "option", alt: "option", command: "command", cmd: "command" };
  const parts = String(input ?? "").trim().toLowerCase().split("+").map((p) => p.trim());
  if (parts.some((p) => !p)) return { ok: false, error: "empty token in trigger" };
  const key = parts.pop();
  if (!KEYBOARD_TRIGGER_KEYS.includes(key)) return { ok: false, error: `unknown trigger key '${key}' (use esc or f1..f19)` };
  const mods = new Set();
  for (const p of parts) {
    if (!aliases[p]) return { ok: false, error: `unknown trigger modifier '${p}' (shift, control, option, command)` };
    mods.add(aliases[p]);
  }
  const order = ["shift", "control", "option", "command"].filter((m) => mods.has(m));
  return { ok: true, canonical: [...order, key].join("+") };
}

export const BUTTON_NAME_RE = /^control:0x[0-9a-fA-F]{1,4}$/;

/** Validate and normalise a button config-name. Returns { ok, name, kind } */
export function parseButton(name) {
  const text = String(name ?? "").trim();
  if (Object.hasOwn(MOUSE_BUTTONS, text)) return { ok: true, name: text, kind: "mouse" };
  const known = KNOWN_CONTROLS.find((c) => c.name === text);
  if (known) return { ok: true, name: text, kind: "key", cid: known.hex };
  if (BUTTON_NAME_RE.test(text)) {
    const cid = parseInt(text.slice(10), 16);
    const k = KNOWN_CONTROLS.find((c) => c.cid === cid);
    // A control with a catalog row must be written under its catalog name: naming it both ways is an error.
    return { ok: true, name: k ? k.name : "control:0x" + cid.toString(16).padStart(4, "0"), kind: "key", cid: "0x" + cid.toString(16).padStart(4, "0") };
  }
  return { ok: false, error: `unknown button '${text}'. Use list_buttons for valid names.` };
}

// ---- Action / binding validation -----------------------------------------------------------

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Validate an Action value (string or single-key object). Returns { ok, action, command } where
 * `command` is true when the action can run arbitrary text/commands.
 */
export function validateAction(value, { inRing = false } = {}) {
  if (typeof value === "string") {
    if (!Object.hasOwn(UNIT_ACTIONS, value)) {
      return { ok: false, error: `unknown action '${value}'. Use list_actions for the catalog.` };
    }
    if (inRing && (value === "None" || value === "ShowActionsRing")) {
      return { ok: false, error: `'${value}' is not allowed inside an Actions Ring slot` };
    }
    return { ok: true, action: value, command: false };
  }
  if (!isPlainObject(value) || Object.keys(value).length !== 1) {
    return { ok: false, error: "an action is either a name string or a single-key object like { CustomShortcut: \"Ctrl+C\" }" };
  }
  const [variant, payload] = Object.entries(value)[0];
  switch (variant) {
    case "SetDpiPreset":
      if (!Number.isInteger(payload) || payload < 0 || payload > 255) return { ok: false, error: "SetDpiPreset needs an integer 0-255" };
      return { ok: true, action: { SetDpiPreset: payload }, command: false };
    case "CustomShortcut":
    case "HoldShortcut":
    case "TapKeyHoldingModifiers": {
      const chord = parseChord(payload);
      if (!chord.ok) return { ok: false, error: `${variant}: ${chord.error}` };
      return { ok: true, action: { [variant]: chord.canonical }, command: false };
    }
    case "OpenApplication": {
      if (!isPlainObject(payload) || typeof payload.path !== "string" || !payload.path.trim()) {
        return { ok: false, error: "OpenApplication needs { path, display_name? } with a non-empty path" };
      }
      const extra = Object.keys(payload).filter((k) => !["path", "display_name"].includes(k));
      if (extra.length) return { ok: false, error: `OpenApplication has unknown fields: ${extra.join(", ")}` };
      const out = { path: payload.path.trim() };
      if (typeof payload.display_name === "string") out.display_name = payload.display_name.trim();
      return { ok: true, action: { OpenApplication: out }, command: false };
    }
    case "TypeText":
    case "RunShellCommand":
    case "RunAppleScript":
      if (typeof payload !== "string" || !payload) return { ok: false, error: `${variant} needs a non-empty string` };
      return { ok: true, action: { [variant]: payload }, command: true };
    case "Workflow": {
      if (!Array.isArray(payload) || payload.length === 0) return { ok: false, error: "Workflow needs a non-empty array of steps" };
      const steps = [];
      for (const [i, step] of payload.entries()) {
        if (!isPlainObject(step) || Object.keys(step).length !== 1) return { ok: false, error: `Workflow step ${i} must be a single-key object` };
        const [kind, arg] = Object.entries(step)[0];
        if (kind === "Delay") {
          const ms = isPlainObject(arg) ? arg.millis : arg;
          if (!Number.isInteger(ms) || ms < 0) return { ok: false, error: `Workflow step ${i}: Delay needs { millis: <non-negative integer> }` };
          steps.push({ Delay: { millis: ms } });
        } else if (kind === "PressKey") {
          const chord = parseChord(arg);
          if (!chord.ok) return { ok: false, error: `Workflow step ${i}: ${chord.error}` };
          steps.push({ PressKey: chord.canonical });
        } else if (["TypeText", "RunAppleScript", "RunShellCommand"].includes(kind)) {
          if (typeof arg !== "string" || !arg) return { ok: false, error: `Workflow step ${i}: ${kind} needs a non-empty string` };
          steps.push({ [kind]: arg });
        } else {
          return { ok: false, error: `Workflow step ${i}: unknown step '${kind}' (TypeText, PressKey, Delay, RunAppleScript, RunShellCommand)` };
        }
      }
      return { ok: true, action: { Workflow: steps }, command: true };
    }
    default:
      return { ok: false, error: `unknown action variant '${variant}'. Use list_actions.` };
  }
}

/**
 * Validate a Binding for a button: Action | {short,long} | {click,wheel:"HorizontalScroll"} | gesture map.
 * Returns { ok, binding, command, shape }.
 */
export function validateBinding(button, value) {
  const direct = validateAction(value);
  if (direct.ok) return { ok: true, binding: direct.action, command: direct.command, shape: "single" };
  const looksSingleVariant = isPlainObject(value) && Object.keys(value).length === 1 && !GESTURE_DIRECTIONS.includes(Object.keys(value)[0]) && !["short", "long", "click", "wheel"].includes(Object.keys(value)[0]);
  if (looksSingleVariant) return { ok: false, error: direct.error };
  if (!isPlainObject(value)) return { ok: false, error: direct.error };
  const keys = Object.keys(value);

  if (keys.includes("short") || keys.includes("long")) {
    if (keys.some((k) => !["short", "long"].includes(k)) || !("short" in value) || !("long" in value)) {
      return { ok: false, error: "a long-press pair needs exactly { short, long }" };
    }
    const s = validateAction(value.short), l = validateAction(value.long);
    if (!s.ok) return { ok: false, error: `short: ${s.error}` };
    if (!l.ok) return { ok: false, error: `long: ${l.error}` };
    return { ok: true, binding: { short: s.action, long: l.action }, command: s.command || l.command, shape: "short_long" };
  }

  if (keys.includes("wheel") || keys.includes("click")) {
    if (!WHEEL_HOLD_BUTTONS.has(button)) return { ok: false, error: "wheel-hold ({click, wheel}) is only valid on Back and Forward" };
    if (keys.some((k) => !["click", "wheel"].includes(k)) || !("click" in value) || value.wheel !== "HorizontalScroll") {
      return { ok: false, error: 'wheel hold must be exactly { click: <action>, wheel: "HorizontalScroll" }' };
    }
    const c = validateAction(value.click);
    if (!c.ok) return { ok: false, error: `click: ${c.error}` };
    return { ok: true, binding: { click: c.action, wheel: "HorizontalScroll" }, command: c.command, shape: "wheel_hold" };
  }

  if (keys.every((k) => GESTURE_DIRECTIONS.includes(k))) {
    if (!GESTURE_BUTTONS.has(button)) return { ok: false, error: `${button} does not support gesture mode (only ${[...GESTURE_BUTTONS].join(", ")})` };
    const out = {};
    let command = false;
    for (const dir of GESTURE_DIRECTIONS) {
      if (!(dir in value)) continue;
      const a = validateAction(value[dir]);
      if (!a.ok) return { ok: false, error: `${dir}: ${a.error}` };
      out[dir] = a.action;
      command ||= a.command;
    }
    return { ok: true, binding: out, command, shape: "gesture" };
  }
  return { ok: false, error: direct.error };
}

export function validateRingEntry(value) {
  if (!isPlainObject(value)) return validateRingEntry({ action: value });
  const keys = Object.keys(value);
  if (keys.some((k) => !["action", "icon", "label"].includes(k)) || !("action" in value)) {
    return { ok: false, error: "a ring entry is { action, icon?, label? }" };
  }
  const a = validateAction(value.action, { inRing: true });
  if (!a.ok) return a;
  const out = { action: a.action };
  if (value.icon !== undefined) {
    if (!RING_ICONS.includes(value.icon)) return { ok: false, error: `unknown ring icon '${value.icon}'` };
    out.icon = value.icon;
  }
  if (value.label !== undefined) {
    if (typeof value.label !== "string") return { ok: false, error: "label must be a string" };
    out.label = value.label;
  }
  return { ok: true, entry: out, command: a.command };
}
