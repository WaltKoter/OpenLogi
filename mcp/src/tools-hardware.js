// Live-hardware tools: everything the `openlogi` CLI can read or write on devices.
// `api *` commands go through the running agent (versioned JSON); the rest talk to hardware directly.

import { z } from "zod";
import { api, resolveApiDevice, run, findBinary, binaryHelp } from "./cli.js";
import { ok, fail, safe, fromEnvelope, fromRun } from "./util.js";
import { CAMERA_CONTROLS } from "./catalog.js";

const device = z.string().optional().describe("Device name (substring, e.g. 'MX Master'), kind, or the exact opaque id from openlogi_list_devices. Optional when only one device matches.");
const save = z.boolean().optional().describe("Also persist the change to config.toml and reload the agent (re-applied on reconnect/wake). Default false = immediate only.");
const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

export function registerHardwareTools(server) {
  server.registerTool(
    "openlogi_status",
    {
      title: "OpenLogi agent status",
      description: "Read OpenLogi agent health: agent version, inventory state (scanning/ready/unavailable), whether Accessibility / Input Monitoring is granted, whether the input hook is installed, HID open failures, launch-at-login. Also reports whether the openlogi CLI was found. Start here when something does not work.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => {
      const bin = findBinary();
      if (!bin) return fail(binaryHelp());
      const res = await api(["status"]);
      return res.ok ? ok({ cli: bin, ...res.data }) : fail(`${res.error.code}: ${res.error.message}`, { cli: bin, hint: "Start the OpenLogi app (or its agent) and quit Logi Options+." });
    }),
  );

  server.registerTool(
    "openlogi_list_devices",
    {
      title: "List OpenLogi devices",
      description: "List devices known to the running agent: opaque id, name, kind (mouse/keyboard/light/...), online flag, battery, measured capabilities and light capabilities. Device ids are route-specific and change after reconnects - refresh before use. Other tools accept a name substring instead of the id.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => fromEnvelope(await api(["devices"]))),
  );

  server.registerTool(
    "openlogi_list_devices_direct",
    {
      title: "List devices (CLI, no agent needed)",
      description: "Run `openlogi list`: paired devices with slot, codename, kind, online state, battery and cameras. Prefers an agent snapshot and falls back to direct HID enumeration, so it works even when the agent is not running.",
      inputSchema: {},
      annotations: READ,
    },
    safe(async () => fromRun(await run(["list"], { timeoutMs: 60000 }))),
  );

  server.registerTool(
    "openlogi_dpi",
    {
      title: "Read or set DPI",
      description: "Read the pointer DPI (current + supported values) or set it. Value must be one of the device-reported supported values (never rounded). With save=true it is persisted and reapplied on reconnect.",
      inputSchema: { device, set: z.number().int().positive().optional().describe("DPI to set. Omit to only read."), save },
      annotations: WRITE,
    },
    safe(async ({ device: sel, set, save: s }) => {
      const { id } = await resolveApiDevice(sel, { requireCapability: "pointer" });
      const args = ["dpi", "--device", id];
      if (set !== undefined) args.push("--set", String(set));
      if (s) args.push("--save");
      return fromEnvelope(await api(args));
    }),
  );

  server.registerTool(
    "openlogi_smartshift",
    {
      title: "Read or set SmartShift wheel",
      description: "Read or change the SmartShift scroll wheel: mode free (free-spin) or ratchet (clicky) and auto-disengage threshold (1-254 in 0.25 turn/s units; 255 = permanent ratchet). Unspecified fields keep their current values. For permanent ratchet pass mode=ratchet AND auto_disengage=255. With save=true the threshold must be 8-255.",
      inputSchema: {
        device,
        mode: z.enum(["free", "ratchet"]).optional(),
        auto_disengage: z.number().int().min(1).max(255).optional(),
        save,
      },
      annotations: WRITE,
    },
    safe(async ({ device: sel, mode, auto_disengage, save: s }) => {
      const { id } = await resolveApiDevice(sel);
      const args = ["smartshift", "--device", id];
      if (mode) args.push("--mode", mode);
      if (auto_disengage !== undefined) args.push("--auto-disengage", String(auto_disengage));
      if (s) args.push("--save");
      return fromEnvelope(await api(args));
    }),
  );

  server.registerTool(
    "openlogi_fn_lock",
    {
      title: "Read or set keyboard Fn lock",
      description: "Read or set Fn lock on a compatible keyboard. 'on' = bare function keys send F1-F12; 'off' = the printed media functions.",
      inputSchema: { device, set: z.enum(["on", "off"]).optional(), save },
      annotations: WRITE,
    },
    safe(async ({ device: sel, set, save: s }) => {
      const { id } = await resolveApiDevice(sel);
      const args = ["fn-lock", "--device", id];
      if (set) args.push("--set", set);
      if (s) args.push("--save");
      return fromEnvelope(await api(args));
    }),
  );

  server.registerTool(
    "openlogi_os_layout",
    {
      title: "Keep keyboard on the host OS layout",
      description: "Set whether a multi-platform keyboard (HID++ 0x4531) is kept on the host OS's key layout. 'on' re-applies the host layout on connect; 'off' leaves the keyboard alone. This is an agent setting, so it is always saved to config.toml.",
      inputSchema: { device, set: z.enum(["on", "off"]) },
      annotations: WRITE,
    },
    safe(async ({ device: sel, set }) => {
      const { id } = await resolveApiDevice(sel);
      return fromEnvelope(await api(["os-layout", "--device", id, "--set", set, "--save"]));
    }),
  );

  server.registerTool(
    "openlogi_report_rate",
    {
      title: "Read or set polling / report rate",
      description: "Read or set the mouse report rate in Hz (HID++ 0x8060/0x8061). Only rates listed in 'supported' for the current connection are accepted.",
      inputSchema: { device, set: z.number().int().positive().optional().describe("Rate in Hz, e.g. 1000"), save },
      annotations: WRITE,
    },
    safe(async ({ device: sel, set, save: s }) => {
      const { id } = await resolveApiDevice(sel);
      const args = ["report-rate", "--device", id];
      if (set !== undefined) args.push("--set", String(set));
      if (s) args.push("--save");
      return fromEnvelope(await api(args));
    }),
  );

  server.registerTool(
    "openlogi_easy_switch",
    {
      title: "Easy-Switch channels",
      description: "List the device's Easy-Switch channels (paired computer name, OS, connection type) or rename the computer on a channel (channel + name together). Renames are stored on the device itself, never in config.toml.",
      inputSchema: { device, channel: z.number().int().min(1).optional(), name: z.string().optional() },
      annotations: WRITE,
    },
    safe(async ({ device: sel, channel, name }) => {
      if ((channel === undefined) !== (name === undefined)) return fail("channel and name must be given together");
      const { id } = await resolveApiDevice(sel);
      const args = ["easy-switch", "--device", id];
      if (channel !== undefined) args.push("--channel", String(channel), "--name", name);
      return fromEnvelope(await api(args));
    }),
  );

  server.registerTool(
    "openlogi_backlight",
    {
      title: "Keyboard backlight (0x1982)",
      description: "Read or persistently set the white keyboard backlight (MX Keys line). Actions: status, on, off, auto (ambient sensor on/off), level (hold a brightness level; turns auto off), battery_saving (turn off when battery is low). Writes go to the keyboard's non-volatile memory. Needs exclusive-ish HID access: quit the GUI/agent if the device cannot be opened.",
      inputSchema: {
        device: z.string().optional().describe("Keyboard name substring"),
        action: z.enum(["status", "on", "off", "auto", "level", "battery_saving"]).default("status"),
        state: z.enum(["on", "off"]).optional().describe("For auto / battery_saving"),
        level: z.number().int().min(0).optional().describe("For action=level; 0 = off, max = level count - 1"),
      },
      annotations: WRITE,
    },
    safe(async ({ device: sel, action, state, level }) => {
      const args = ["backlight"];
      if (sel) args.push("--device", sel);
      if (action === "auto" || action === "battery_saving") {
        if (!state) return fail(`action=${action} needs state=on|off`);
        args.push(action === "auto" ? "auto" : "battery-saving", state);
      } else if (action === "level") {
        if (level === undefined) return fail("action=level needs level");
        args.push("level", String(level));
      } else args.push(action);
      return fromRun(await run(args, { timeoutMs: 45000 }));
    }),
  );

  server.registerTool(
    "openlogi_light",
    {
      title: "Standalone lights (Litra)",
      description: "Control standalone Logitech Litra lights: list, status (read back from the light), on, off, brightness (percent 0-100 or native lumens), temperature (Kelvin).",
      inputSchema: {
        action: z.enum(["list", "status", "on", "off", "brightness", "temperature"]),
        device: z.string().optional().describe("Substring of the light name/identity"),
        percent: z.number().int().min(0).max(100).optional(),
        lumens: z.number().int().positive().optional(),
        kelvin: z.number().int().positive().optional(),
      },
      annotations: WRITE,
    },
    safe(async ({ action, device: sel, percent, lumens, kelvin }) => {
      const args = ["light", action];
      if (action !== "list" && sel) args.push("--device", sel);
      if (action === "brightness") {
        if ((percent === undefined) === (lumens === undefined)) return fail("brightness needs exactly one of percent or lumens");
        args.push(percent !== undefined ? "--percent" : "--lumens", String(percent ?? lumens));
      }
      if (action === "temperature") {
        if (kelvin === undefined) return fail("temperature needs kelvin");
        args.push("--kelvin", String(kelvin));
      }
      return fromRun(await run(args, { timeoutMs: 30000 }));
    }),
  );

  server.registerTool(
    "openlogi_camera",
    {
      title: "Webcam UVC controls",
      description: `Read (get) or write (set) device-level UVC image controls on a Logitech webcam; changes live in the camera so Meet/Zoom/OBS see them. Controls: ${CAMERA_CONTROLS.join(", ")}. Auto toggles (*_auto) take 0/1; others use the raw device unit within the min/max reported by 'get'.`,
      inputSchema: {
        action: z.enum(["get", "set"]).default("get"),
        camera: z.string().optional().describe("Camera unique id (default: first Logitech camera)"),
        control: z.string().optional(),
        value: z.number().int().optional(),
      },
      annotations: WRITE,
    },
    safe(async ({ action, camera, control, value }) => {
      const args = ["camera"];
      if (camera) args.push("--camera", camera);
      if (action === "set") {
        if (!control || value === undefined) return fail("set needs control and value");
        if (!CAMERA_CONTROLS.includes(control)) return fail(`unknown control '${control}'. Valid: ${CAMERA_CONTROLS.join(", ")}`);
        args.push("set", control, String(value));
      } else args.push("get");
      return fromRun(await run(args, { timeoutMs: 30000 }));
    }),
  );

  server.registerTool(
    "openlogi_snapshot",
    {
      title: "Capture a webcam frame",
      description: "Capture one frame from a Logitech webcam to a PNG file (needs Camera permission).",
      inputSchema: { path: z.string().default("snapshot.png").describe("Output PNG path"), camera: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    safe(async ({ path: out, camera }) => {
      const args = ["snapshot", out];
      if (camera) args.push("--camera", camera);
      return fromRun(await run(args, { timeoutMs: 30000 }));
    }),
  );

  server.registerTool(
    "openlogi_assets_sync",
    {
      title: "Sync device images",
      description: "Pre-fetch device render assets from the fastest OpenLogi mirror (network access to assets.openlogi.org / Cloudflare / jsDelivr). Optionally pin one origin.",
      inputSchema: { base: z.string().url().optional().describe("Uniform asset origin URL") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    safe(async ({ base }) => {
      const args = ["assets", "sync"];
      if (base) args.push("--base", base);
      return fromRun(await run(args, { timeoutMs: 300000 }));
    }),
  );

  server.registerTool(
    "openlogi_diag",
    {
      title: "Hardware diagnostics",
      description: [
        "Run an `openlogi diag` subcommand directly against hardware (bypasses the agent).",
        "Read-only: features (every HID++ feature), controls (reprogrammable controls + divert/raw-XY flags - use it to find control:0x<cid> names), battery (raw report).",
        "Writes (restore afterwards where noted): wheel (read, or set resolution low|high), lighting (solid RGB colour on a wired RGB keyboard; method auto|effects|perkey|perkeyv2),",
        "dpi (round-trip test, restores), smartshift (toggle round-trip or set sensitivity 1-255, leave_flipped), pointer_speed (0x2205 scaling test, restores).",
        "Direct HID access can conflict with a running agent; if the device cannot be opened, quit the agent/GUI first.",
      ].join(" "),
      inputSchema: {
        kind: z.enum(["features", "controls", "battery", "wheel", "lighting", "dpi", "smartshift", "pointer_speed"]),
        device: z.string().optional().describe("Device name substring"),
        resolution: z.enum(["low", "high"]).optional().describe("wheel: write this resolution"),
        color: z.string().regex(/^[0-9a-fA-F]{6}$/).optional().describe("lighting: RRGGBB"),
        method: z.enum(["auto", "effects", "perkey", "perkeyv2"]).optional().describe("lighting method"),
        target: z.number().int().positive().optional().describe("dpi: test DPI; pointer_speed: raw 8.8 fixed-point (256 = 1x)"),
        sensitivity: z.number().int().min(1).max(255).optional().describe("smartshift: auto-disengage sensitivity"),
        leave_flipped: z.boolean().optional().describe("smartshift: skip the restoring toggle"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    safe(async (a) => {
      const args = ["diag", a.kind === "pointer_speed" ? "pointer-speed" : a.kind];
      if (a.kind === "lighting") {
        if (!a.color) return fail("lighting needs color (RRGGBB)");
        args.push(a.color);
        if (a.method) args.push("--method", a.method);
      }
      if (a.kind === "wheel" && a.resolution) args.push("--resolution", a.resolution);
      if ((a.kind === "dpi" || a.kind === "pointer_speed") && a.target !== undefined) args.push("--target", String(a.target));
      if (a.kind === "smartshift") {
        if (a.sensitivity !== undefined) args.push("--sensitivity", String(a.sensitivity));
        if (a.leave_flipped) args.push("--leave-flipped");
      }
      if (a.device) args.push("--device", a.device);
      return fromRun(await run(args, { timeoutMs: 90000 }));
    }),
  );

  server.registerTool(
    "openlogi_cli_help",
    {
      title: "CLI help",
      description: "Show `openlogi [subcommand...] --help` or --version to discover options of the installed build (useful when its flags differ from this server's expectations).",
      inputSchema: { subcommand: z.array(z.enum(["api", "list", "backlight", "snapshot", "camera", "assets", "diag", "light", "dpi", "smartshift", "fn-lock", "os-layout", "report-rate", "easy-switch", "sync", "features", "controls", "battery", "wheel", "lighting", "pointer-speed", "status", "devices", "reload"])).optional(), version: z.boolean().optional() },
      annotations: READ,
    },
    safe(async ({ subcommand, version }) => fromRun(await run(version ? ["--version"] : [...(subcommand ?? []), "--help"]))),
  );
}
