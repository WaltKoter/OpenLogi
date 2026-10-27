// config.toml access: location, atomic writes, backups, strict validation, device resolution.
// Mirrors crates/openlogi-core/src/config (schema_version 8, deny_unknown_fields everywhere).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { parse, stringify } from "smol-toml";

export const SCHEMA_VERSION = 8;
// The released app (0.8.14) still writes schema 7; master writes 8. Fields this server edits are identical in both,
// so a file keeps the version it has and is never upgraded or downgraded here.
export const SUPPORTED_SCHEMAS = [7, 8];

const TOP_LEVEL_KEYS = new Set(["schema_version", "selected_device", "app_settings", "devices", "keyboard"]);

const APP_SETTING_SPECS = {
  launch_at_login: "boolean",
  check_for_updates: "boolean",
  auto_install_updates: "boolean",
  update_prompt_seen: "boolean",
  show_in_menu_bar: "boolean",
  capture_mouse_events: "boolean",
  smooth_scroll: "boolean",
  vertical_scroll_sensitivity: { int: [1, 100] },
  thumbwheel_sensitivity: { int: [1, 100] },
  app_icon: { enum: ["openlogi", "prism"] },
  auto_download_assets: "boolean",
  asset_source: { enum: ["automatic", "openlogi", "cloudflare", "fastly"] },
  language: "string",
  appearance: { enum: ["system", "light", "dark"] },
  ui_scale: { enum: ["small", "normal", "large", "extra_large"] },
  device_view_mode: { enum: ["grid", "list", "carousel"] },
  theme_light: "string",
  theme_dark: "string",
  ui_radius: { int: [0, 255] },
  mouse_profile_target: { enum: ["pointer", "focused"] },
};
export const APP_SETTING_DOCS = APP_SETTING_SPECS;

const DEVICE_KEYS = new Set([
  "enabled", "custom_name", "identity", "links", "bindings", "disabled_gestures", "per_app_bindings",
  "action_ring", "dpi_presets", "dpi", "lighting", "light", "smartshift", "camera_controls", "camera_profiles",
  "camera_profile", "thumbwheel_sensitivity", "invert_scroll", "scroll_resolution", "smooth_wheel",
  "host_switch_targets", "fn_lock", "keep_os_layout", "report_rate",
]);

export function configPath() {
  if (process.env.OPENLOGI_CONFIG) return path.resolve(process.env.OPENLOGI_CONFIG);
  const xdg = process.env.XDG_CONFIG_HOME;
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), ".config");
  return path.join(base, "openlogi", "config.toml");
}

const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

export class ConfigError extends Error {}

/** Read the config. A missing file yields an empty schema-8 document. */
export function readConfig() {
  const file = configPath();
  let raw = null;
  try {
    raw = fs.readFileSync(fs.realpathSync(file), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw new ConfigError(`cannot read ${file}: ${e.message}`);
  }
  let data;
  if (raw === null) data = { schema_version: SCHEMA_VERSION };
  else {
    try {
      data = parse(raw);
    } catch (e) {
      throw new ConfigError(`config.toml is not valid TOML: ${e.message}`);
    }
  }
  return { file, exists: raw !== null, raw: raw ?? "", data, hash: sha(raw ?? "") };
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function checkScalar(label, value, spec, problems) {
  if (spec === "boolean") {
    if (typeof value !== "boolean") problems.push(`${label} must be a boolean`);
  } else if (spec === "string") {
    if (typeof value !== "string") problems.push(`${label} must be a string`);
  } else if (spec.enum) {
    if (!spec.enum.includes(value)) problems.push(`${label} must be one of: ${spec.enum.join(", ")}`);
  } else if (spec.int) {
    const [lo, hi] = spec.int;
    if (!Number.isInteger(value) || value < lo || value > hi) problems.push(`${label} must be an integer ${lo}-${hi}`);
  }
}

const HEX6 = /^[0-9a-fA-F]{6}$/;

function validateLighting(label, v, problems) {
  if (!isObj(v)) return problems.push(`${label} must be a table`);
  for (const k of Object.keys(v)) if (!["enabled", "color", "brightness"].includes(k)) problems.push(`${label}.${k} is not a known field`);
  if ("enabled" in v && typeof v.enabled !== "boolean") problems.push(`${label}.enabled must be a boolean`);
  if ("color" in v && !(typeof v.color === "string" && HEX6.test(v.color))) problems.push(`${label}.color must be 6 hex digits (RRGGBB)`);
  if ("brightness" in v && !(Number.isInteger(v.brightness) && v.brightness >= 0 && v.brightness <= 100)) problems.push(`${label}.brightness must be 0-100`);
}

function validateSmartShift(label, v, problems) {
  if (!isObj(v)) return problems.push(`${label} must be a table`);
  for (const k of Object.keys(v)) if (!["mode", "auto_disengage", "tunable_torque"].includes(k)) problems.push(`${label}.${k} is not a known field`);
  if (!["free", "ratchet"].includes(v.mode)) problems.push(`${label}.mode must be free or ratchet`);
  if (!(Number.isInteger(v.auto_disengage) && v.auto_disengage >= 8 && v.auto_disengage <= 255)) problems.push(`${label}.auto_disengage must be 8-255 (255 = permanent ratchet)`);
  if ("tunable_torque" in v && !(Number.isInteger(v.tunable_torque) && v.tunable_torque >= 0 && v.tunable_torque <= 100)) problems.push(`${label}.tunable_torque must be 0-100`);
}

function validateLight(label, v, problems) {
  if (!isObj(v)) return problems.push(`${label} must be a table`);
  for (const k of Object.keys(v)) if (!["enabled", "auto_camera", "brightness_percent", "temperature_kelvin", "color"].includes(k)) problems.push(`${label}.${k} is not a known field`);
  if ("enabled" in v && typeof v.enabled !== "boolean") problems.push(`${label}.enabled must be a boolean`);
  if ("auto_camera" in v && typeof v.auto_camera !== "boolean") problems.push(`${label}.auto_camera must be a boolean`);
  if ("brightness_percent" in v && !(Number.isInteger(v.brightness_percent) && v.brightness_percent >= 0 && v.brightness_percent <= 100)) problems.push(`${label}.brightness_percent must be 0-100`);
  if ("temperature_kelvin" in v && !(Number.isInteger(v.temperature_kelvin) && v.temperature_kelvin > 0)) problems.push(`${label}.temperature_kelvin must be a positive integer`);
  if ("color" in v && !(typeof v.color === "string" && HEX6.test(v.color.replace(/^#/, "")))) problems.push(`${label}.color must be RRGGBB hex`);
}

/** Validate a full config document. Returns an array of human-readable problems (empty = OK). */
export function validateConfig(data) {
  const problems = [];
  if (!isObj(data)) return ["config must be a table"];
  if (!SUPPORTED_SCHEMAS.includes(data.schema_version)) problems.push(`schema_version must be ${SUPPORTED_SCHEMAS.join(" or ")} (found ${data.schema_version})`);
  for (const k of Object.keys(data)) if (!TOP_LEVEL_KEYS.has(k)) problems.push(`unknown top-level field '${k}'`);
  if ("selected_device" in data && typeof data.selected_device !== "string") problems.push("selected_device must be a string");

  if ("app_settings" in data) {
    if (!isObj(data.app_settings)) problems.push("app_settings must be a table");
    else {
      for (const [k, v] of Object.entries(data.app_settings)) {
        if (!(k in APP_SETTING_SPECS)) problems.push(`app_settings.${k} is not a known setting`);
        else checkScalar(`app_settings.${k}`, v, APP_SETTING_SPECS[k], problems);
      }
    }
  }

  if ("keyboard" in data) {
    if (!isObj(data.keyboard) || Object.keys(data.keyboard).some((k) => k !== "bindings")) problems.push("keyboard only supports a 'bindings' table");
    else if ("bindings" in data.keyboard && !isObj(data.keyboard.bindings)) problems.push("keyboard.bindings must be a table");
  }

  if ("devices" in data) {
    if (!isObj(data.devices)) problems.push("devices must be a table");
    else {
      for (const [key, dev] of Object.entries(data.devices)) {
        const L = `devices."${key}"`;
        if (!isObj(dev)) { problems.push(`${L} must be a table`); continue; }
        for (const k of Object.keys(dev)) if (!DEVICE_KEYS.has(k)) problems.push(`${L}.${k} is not a known device field`);
        for (const b of ["enabled", "invert_scroll", "smooth_wheel", "fn_lock", "keep_os_layout"]) {
          if (b in dev && typeof dev[b] !== "boolean") problems.push(`${L}.${b} must be a boolean`);
        }
        if ("custom_name" in dev && typeof dev.custom_name !== "string") problems.push(`${L}.custom_name must be a string`);
        if ("dpi" in dev && !(Number.isInteger(dev.dpi) && dev.dpi > 0 && dev.dpi <= 65535)) problems.push(`${L}.dpi must be a positive integer`);
        if ("dpi_presets" in dev && !(Array.isArray(dev.dpi_presets) && dev.dpi_presets.every((n) => Number.isInteger(n) && n > 0 && n <= 65535))) problems.push(`${L}.dpi_presets must be an array of positive integers`);
        if ("thumbwheel_sensitivity" in dev && !(Number.isInteger(dev.thumbwheel_sensitivity) && dev.thumbwheel_sensitivity >= 1 && dev.thumbwheel_sensitivity <= 100)) problems.push(`${L}.thumbwheel_sensitivity must be 1-100`);
        if ("scroll_resolution" in dev && !["low", "high"].includes(dev.scroll_resolution)) problems.push(`${L}.scroll_resolution must be low or high`);
        if ("report_rate" in dev && !(Number.isInteger(dev.report_rate) && dev.report_rate > 0)) problems.push(`${L}.report_rate must be a positive integer (Hz)`);
        if ("host_switch_targets" in dev && !(Array.isArray(dev.host_switch_targets) && dev.host_switch_targets.every((s) => typeof s === "string"))) problems.push(`${L}.host_switch_targets must be an array of device keys`);
        if ("lighting" in dev) validateLighting(`${L}.lighting`, dev.lighting, problems);
        if ("smartshift" in dev) validateSmartShift(`${L}.smartshift`, dev.smartshift, problems);
        if ("light" in dev) validateLight(`${L}.light`, dev.light, problems);
        if ("camera_controls" in dev && !(isObj(dev.camera_controls) && Object.values(dev.camera_controls).every(Number.isInteger))) problems.push(`${L}.camera_controls must map control names to integers`);
        if ("camera_profiles" in dev) {
          if (!isObj(dev.camera_profiles) || !Object.values(dev.camera_profiles).every((p) => isObj(p) && Object.values(p).every(Number.isInteger))) problems.push(`${L}.camera_profiles must map names to {control: integer} tables`);
        }
        if ("bindings" in dev && !isObj(dev.bindings)) problems.push(`${L}.bindings must be a table`);
        if ("per_app_bindings" in dev && !isObj(dev.per_app_bindings)) problems.push(`${L}.per_app_bindings must be a table`);
        if ("action_ring" in dev) {
          const r = dev.action_ring;
          if (!isObj(r)) problems.push(`${L}.action_ring must be a table`);
          else for (const k of Object.keys(r)) if (!["enabled", "haptics", "default", "per_app"].includes(k)) problems.push(`${L}.action_ring.${k} is not a known field`);
        }
      }
    }
  }
  return problems;
}

/** Backup `file` beside itself as config.toml.mcp-backup.<timestamp>; keep the newest 20. */
function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = `${file}.mcp-backup.${stamp}`;
  fs.copyFileSync(file, dest);
  const dir = path.dirname(file), prefix = path.basename(file) + ".mcp-backup.";
  const all = fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).sort();
  for (const old of all.slice(0, Math.max(0, all.length - 20))) fs.rmSync(path.join(dir, old), { force: true });
  return dest;
}

export function listBackups() {
  const file = configPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith("config.toml.mcp-backup.")) out.push({ kind: "mcp", name, path: path.join(dir, name) });
    else if (/^config\.toml\.backup\.\d+$/.test(name)) out.push({ kind: "gui", name, path: path.join(dir, name) });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Apply `mutator(data)` to a deep copy of the config, validate, back up and write atomically.
 * Throws ConfigError on validation failure or if the file changed underneath us.
 */
export function updateConfig(mutator, { dryRun = false } = {}) {
  const current = readConfig();
  const data = structuredClone(current.data);
  if (!current.exists || data.schema_version === undefined) data.schema_version = SCHEMA_VERSION;
  if (!SUPPORTED_SCHEMAS.includes(data.schema_version)) {
    throw new ConfigError(`config.toml uses schema_version ${data.schema_version}; this server edits schema ${SUPPORTED_SCHEMAS.join(" or ")}. Open the OpenLogi GUI once so it migrates the file.`);
  }
  const result = mutator(data);
  const problems = validateConfig(data);
  if (problems.length) throw new ConfigError("refusing to write an invalid config:\n- " + problems.join("\n- "));
  const text = stringify(data) + "\n";
  if (dryRun) return { result, changed: text !== current.raw, preview: text, file: current.file, backup: null };

  const recheck = readConfig();
  if (recheck.hash !== current.hash) throw new ConfigError("config.toml changed while editing (GUI or another tool wrote it). Retry.");
  if (text === current.raw) return { result, changed: false, file: current.file, backup: null };

  const target = fs.existsSync(current.file) ? fs.realpathSync(current.file) : current.file;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const backup = backupFile(target);
  const tmp = `${target}.mcp-tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, target);
  return { result, changed: true, file: current.file, backup };
}

export function restoreBackup(name) {
  const entry = listBackups().find((b) => b.name === name);
  if (!entry) throw new ConfigError(`no such backup '${name}'`);
  const raw = fs.readFileSync(entry.path, "utf8");
  let data;
  try { data = parse(raw); } catch (e) { throw new ConfigError(`backup is not valid TOML: ${e.message}`); }
  const problems = validateConfig(data);
  if (problems.length) throw new ConfigError("backup fails validation:\n- " + problems.join("\n- "));
  const file = configPath();
  const target = fs.existsSync(file) ? fs.realpathSync(file) : file;
  backupFile(target);
  const tmp = `${target}.mcp-tmp-${process.pid}`;
  fs.writeFileSync(tmp, raw, "utf8");
  fs.renameSync(tmp, target);
  return { restored: entry.name, file };
}

/** Resolve a device selector against config entries. Returns the config key. */
export function resolveConfigDevice(data, selector) {
  const devices = isObj(data.devices) ? data.devices : {};
  const keys = Object.keys(devices);
  if (!selector || selector === "selected") {
    if (typeof data.selected_device === "string" && devices[data.selected_device]) return data.selected_device;
    if (keys.length === 1) return keys[0];
    throw new ConfigError(keys.length ? `no device selected; specify one of: ${keys.map((k) => describeDevice(devices, k)).join("; ")}` : "config has no devices yet - open OpenLogi with the device connected so it records one");
  }
  if (devices[selector]) return selector;
  const q = String(selector).toLowerCase();
  const hits = keys.filter((k) => {
    const d = devices[k];
    return [k, d.custom_name, d.identity?.display_name, d.identity?.codename].some((s) => typeof s === "string" && s.toLowerCase().includes(q));
  });
  if (hits.length === 1) return hits[0];
  if (hits.length === 0) throw new ConfigError(`no config device matches '${selector}'. Known: ${keys.map((k) => describeDevice(devices, k)).join("; ") || "(none)"}`);
  throw new ConfigError(`'${selector}' is ambiguous: ${hits.map((k) => describeDevice(devices, k)).join("; ")}`);
}

export function describeDevice(devices, key) {
  const d = devices[key] ?? {};
  const name = d.custom_name ?? d.identity?.display_name ?? "?";
  const kind = d.identity?.kind ? ` [${d.identity.kind}]` : "";
  return `${key} (${name}${kind})`;
}

export function ensureDevice(data, key) {
  data.devices ??= {};
  data.devices[key] ??= {};
  return data.devices[key];
}
