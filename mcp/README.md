# OpenLogi MCP

An [MCP](https://modelcontextprotocol.io) server that lets Claude configure Logitech mice and keyboards
through OpenLogi: button remapping, gestures, long-press, wheel-hold, per-app profiles, the Actions Ring,
global F-key remaps, DPI, SmartShift, report rate, Fn lock, backlight, lights, webcams, and every
`config.toml` setting.

It does **not** talk HID itself. Two channels, both owned by OpenLogi:

| What | How |
|---|---|
| Live hardware (DPI, SmartShift, report rate, Fn lock, Easy-Switch, backlight, lights, camera, diagnostics) | the `openlogi` CLI (`openlogi api ...` goes through the running agent) |
| Saved behaviour (bindings, gestures, profiles, ring, device/app settings) | strict, validated edits to `config.toml`, then an agent reload |

## Requirements

- Node.js 20+
- OpenLogi installed and its agent running (open the app once), **Logi Options+ closed**
- The `openlogi` CLI reachable: on `PATH`, or `OPENLOGI_BIN=C:\path\to\openlogi.exe`
  (also looked up in the usual install folders and in `<repo>/target/{release,debug}`)

## Install

```sh
cd mcp
npm install
npm test        # end-to-end tests against a temp config; no hardware needed
```

Claude Code:

```sh
claude mcp add openlogi -- node "<path-to-repo>/mcp/src/index.js"
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "openlogi": {
      "command": "node",
      "args": ["C:\\path\\to\\OpenLogi\\mcp\\src\\index.js"],
      "env": { "OPENLOGI_BIN": "C:\\path\\to\\openlogi.exe" }
    }
  }
}
```

Environment: `OPENLOGI_BIN` (CLI path), `OPENLOGI_CONFIG` (config file override; default
`~/.config/openlogi/config.toml`, `%USERPROFILE%\.config\openlogi\config.toml` on Windows).

## Tools

**Discover** - `openlogi_status`, `openlogi_list_devices`, `openlogi_list_devices_direct`,
`openlogi_config_info`, `openlogi_config_devices`, `openlogi_list_actions`, `openlogi_list_buttons`,
`openlogi_list_settings`, `openlogi_validate_shortcut`, `openlogi_validate_binding`, `openlogi_cli_help`

**Buttons and gestures** - `openlogi_set_binding` (single action, long-press pair, wheel-hold, gesture map;
global or per-app; mouse buttons and keyboard keys incl. `control:0x<cid>`), `openlogi_remove_binding`,
`openlogi_remove_app_profile`, `openlogi_set_gesture`, `openlogi_set_gesture_mode`, `openlogi_set_long_press`,
`openlogi_set_wheel_hold`, `openlogi_list_bindings`

**Global keyboard remap** - `openlogi_set_keyboard_binding`, `openlogi_remove_keyboard_binding`,
`openlogi_list_keyboard_bindings`

**Actions Ring** - `openlogi_get_action_ring`, `openlogi_set_ring_slot`, `openlogi_clear_ring_slot`,
`openlogi_set_ring_options`

**Settings** - `openlogi_set_device_settings`, `openlogi_set_dpi_presets`, `openlogi_set_app_settings`,
`openlogi_select_device`, `openlogi_save_camera_profile`, `openlogi_config_set_raw` (any path, still
schema-validated)

**Live hardware** - `openlogi_dpi`, `openlogi_smartshift`, `openlogi_fn_lock`, `openlogi_os_layout`,
`openlogi_report_rate`, `openlogi_easy_switch`, `openlogi_backlight`, `openlogi_light`, `openlogi_camera`,
`openlogi_snapshot`, `openlogi_assets_sync`, `openlogi_diag` (features, controls, battery, wheel, lighting,
dpi, smartshift, pointer_speed)

**Safety nets** - `openlogi_config_read`, `openlogi_config_validate`, `openlogi_config_backups`,
`openlogi_config_restore`, `openlogi_reload_agent`; every edit tool takes `dry_run` and `reload`.

## Behaviour worth knowing

- **Validation mirrors the app.** OpenLogi's schema is strict (unknown or out-of-range fields stop the config
  from loading), so every write is validated first and refused if invalid. Chords are parsed with the same
  grammar as `KeyCombo` and written in canonical form (`Cmd+Shift+P`).
- **Every write is backed up** to `config.toml.mcp-backup.<timestamp>` (newest 20 kept) and written atomically.
  If the file changed while editing (GUI saved), the edit is rejected, not merged.
- **Comments are not preserved.** The file is re-serialised; the GUI keeps comments, this server does not.
  Use `openlogi_config_restore` to go back.
- **Command-class actions are gated.** `TypeText`, `RunShellCommand`, `RunAppleScript` and `Workflow` make a
  button press type or run things; they are refused unless `allow_command_actions=true`.
- **Reload.** The agent has no file watcher and no `api reload` command in 0.8.x, so after a config edit the
  server re-saves a mouse's *current* DPI with `--save`, which makes the agent reload (it only rewrites that one
  verified setting). If no device is online, open the GUI or restart the agent. A future `openlogi api reload`
  is used automatically when present.
- **Device ids** from `openlogi_list_devices` are route-specific; tools accept names (`"MX Master"`) and resolve
  them for you.
- Mouse `Back`/`Forward`/`DpiToggle`/`GestureButton`/`HapticPanel` support gesture mode; wheel-hold is
  `Back`/`Forward` only. Left/Right click are rebindable in the schema but the OS hook never suppresses them.
