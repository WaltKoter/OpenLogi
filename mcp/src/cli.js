// Thin wrapper around the `openlogi` CLI. Hardware access always goes through the real
// binary (and, for `openlogi api`, through the running OpenLogi agent) - never raw HID.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const EXE = process.platform === "win32" ? "openlogi.exe" : "openlogi";
const here = path.dirname(fileURLToPath(import.meta.url));

export class CliError extends Error {
  constructor(message, extra = {}) {
    super(message);
    Object.assign(this, extra);
  }
}

function candidates() {
  const list = [];
  if (process.env.OPENLOGI_BIN) list.push(process.env.OPENLOGI_BIN);
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) if (dir) list.push(path.join(dir, EXE));
  const home = os.homedir();
  if (process.platform === "win32") {
    for (const base of [process.env.LOCALAPPDATA, process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (!base) continue;
      for (const root of [path.join(base, "OpenLogi"), path.join(base, "Programs", "OpenLogi")]) list.push(path.join(root, "bin", EXE), path.join(root, EXE));
    }
  } else if (process.platform === "darwin") {
    list.push("/Applications/OpenLogi.app/Contents/MacOS/openlogi", "/opt/homebrew/bin/openlogi", "/usr/local/bin/openlogi");
  } else {
    list.push("/usr/bin/openlogi", "/usr/local/bin/openlogi", path.join(home, ".local", "bin", "openlogi"));
  }
  // A checkout built with `cargo build`: <repo>/mcp/src -> <repo>/target/{release,debug}
  const repo = path.resolve(here, "..", "..");
  list.push(path.join(repo, "target", "release", EXE), path.join(repo, "target", "debug", EXE));
  return list;
}

let cached = null;
export function findBinary() {
  if (cached && fs.existsSync(cached)) return cached;
  for (const c of candidates()) {
    try {
      if (fs.statSync(c).isFile()) return (cached = c);
    } catch { /* keep looking */ }
  }
  return null;
}

export function binaryHelp() {
  return "The `openlogi` CLI was not found. Install OpenLogi (https://github.com/AprilNEA/OpenLogi/releases) or build it with `cargo build --release`, then set OPENLOGI_BIN to the executable path or put it on PATH. Quit Logi Options+ first.";
}

/** Run the CLI. Resolves { code, stdout, stderr }. Never throws on non-zero exit. */
export function run(args, { timeoutMs = 30000 } = {}) {
  const bin = findBinary();
  if (!bin) return Promise.reject(new CliError(binaryHelp(), { code: "binary_not_found" }));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      reject(new CliError(`openlogi ${args.join(" ")} timed out after ${timeoutMs} ms`, { code: "timeout" }));
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      if (!done) { done = true; reject(new CliError(`failed to start ${bin}: ${e.message}`, { code: "spawn_failed" })); }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!done) { done = true; resolve({ code, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() }); }
    });
  });
}

/** `openlogi api ...` - returns the parsed JSON envelope (ok:true or ok:false). */
export async function api(args, opts) {
  const res = await run(["api", ...args], opts);
  let json;
  try {
    json = JSON.parse(res.stdout.split("\n").filter(Boolean).pop() ?? "");
  } catch {
    return { schema_version: 1, ok: false, error: { code: "bad_output", message: (res.stderr || res.stdout || `exit ${res.code}`).slice(0, 2000) } };
  }
  return json;
}

/** Fetch the agent device list (throws CliError when the agent is unavailable). */
export async function listApiDevices() {
  const res = await api(["devices"]);
  if (!res.ok) throw new CliError(`${res.error.code}: ${res.error.message}`, { code: res.error.code });
  return res.data;
}

/**
 * Resolve a device selector to an opaque agent id. Accepts the exact id, or a case-insensitive
 * substring of the device name / kind. Online devices win ties. Returns { id, device }.
 */
export async function resolveApiDevice(selector, { requireCapability } = {}) {
  const data = await listApiDevices();
  if (data.inventory !== "ready") throw new CliError(`device inventory is '${data.inventory}', not ready yet - retry shortly`, { code: "inventory_not_ready" });
  const devices = data.devices ?? [];
  if (selector) {
    const exact = devices.find((d) => d.id === selector);
    if (exact) return { id: exact.id, device: exact };
  }
  let pool = devices.filter((d) => d.id);
  if (selector) {
    const q = selector.toLowerCase();
    pool = pool.filter((d) => [d.name, d.kind].some((s) => typeof s === "string" && s.toLowerCase().includes(q)));
  }
  if (requireCapability) {
    const withCap = pool.filter((d) => d.capabilities && d.capabilities[requireCapability]);
    if (withCap.length) pool = withCap;
  }
  const online = pool.filter((d) => d.online);
  if (online.length) pool = online;
  if (pool.length === 1) return { id: pool[0].id, device: pool[0] };
  const names = devices.map((d) => `${d.name ?? "?"} [${d.kind}]${d.online ? "" : " (offline)"}`);
  if (pool.length === 0) throw new CliError(`no agent device matches '${selector ?? "(any)"}'. Known: ${names.join("; ") || "(none)"}`, { code: "device_not_found" });
  throw new CliError(`'${selector ?? "(any)"}' matches ${pool.length} devices (${pool.map((d) => d.name).join(", ")}); pass a more specific name or the exact id`, { code: "ambiguous_device" });
}

/**
 * Ask the agent to re-read config.toml. A dedicated `openlogi api reload` is tried first; older
 * builds have none, so we fall back to re-saving a device's current DPI with --save, which makes
 * the agent reload the file as a side effect (and only rewrites that one verified setting).
 */
export async function reloadAgentConfig() {
  const direct = await run(["api", "reload"]).catch((e) => ({ code: -1, stdout: "", stderr: e.message }));
  if (direct.code === 0) return { ok: true, method: "api reload" };

  let data;
  try { data = await listApiDevices(); } catch (e) { return { ok: false, method: "none", reason: e.message }; }
  const candidates = (data.devices ?? []).filter((d) => d.id && d.online && d.kind !== "keyboard");
  for (const d of candidates) {
    const read = await api(["dpi", "--device", d.id]);
    if (!read.ok) continue;
    const save = await api(["dpi", "--device", d.id, "--set", String(read.data.current), "--save"]);
    if (save.ok) return { ok: true, method: `dpi re-save on ${d.name} (agent reloads config on save)` };
  }
  return { ok: false, method: "none", reason: "no online device accepted a DPI re-save; open the OpenLogi GUI or restart the agent to apply the file" };
}
