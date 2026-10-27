#!/usr/bin/env node
// OpenLogi MCP server: configure Logitech mice and keyboards from Claude.
// Transport: stdio. Hardware via the `openlogi` CLI / agent, settings via config.toml.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerHardwareTools } from "./tools-hardware.js";
import { registerConfigTools } from "./tools-config.js";
import { registerPasteTools } from "./tools-paste.js";

const INSTRUCTIONS = `
OpenLogi MCP - configure Logitech mice and keyboards (buttons, gestures, DPI, SmartShift, per-app profiles, Actions Ring, lighting, cameras).

Workflow:
1. openlogi_status, then openlogi_list_devices (live) and openlogi_config_devices (saved).
2. Discover valid names with openlogi_list_actions / openlogi_list_buttons / openlogi_list_settings.
3. Change behaviour:
   - Button/gesture/ring/profile/F-key remaps and saved settings -> config tools (openlogi_set_binding, openlogi_set_gesture, openlogi_set_long_press, openlogi_set_wheel_hold, openlogi_set_ring_slot, openlogi_set_keyboard_binding, openlogi_set_device_settings, ...). These edit config.toml (backed up on every write) and ask the agent to reload.
   - Immediate hardware settings (DPI, SmartShift, report rate, Fn lock, backlight, lights, camera) -> hardware tools; pass save=true to persist.
4. Use dry_run=true to preview, openlogi_config_backups / openlogi_config_restore to undo.

Safety: TypeText / RunShellCommand / RunAppleScript / Workflow actions make a button press type or execute things; they are refused unless allow_command_actions=true and the user explicitly asked for them. Logi Options+ must be closed (it fights OpenLogi for HID++ access). Device ids from the agent are route-specific - prefer names.
`.trim();

const server = new McpServer({ name: "openlogi", version: "0.1.0" }, { instructions: INSTRUCTIONS });
registerHardwareTools(server);
registerConfigTools(server);
registerPasteTools(server);

await server.connect(new StdioServerTransport());
