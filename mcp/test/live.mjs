import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const c = new Client({ name: "live", version: "0" });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [new URL("../src/index.js", import.meta.url).pathname.slice(1).replaceAll("%20"," ")] }));
const show = async (name, args = {}) => {
  const r = await c.callTool({ name, arguments: args });
  console.log(`\n### ${name} ${JSON.stringify(args)}${r.isError ? "  [ERROR]" : ""}\n` + r.content[0].text.slice(0, 1500));
};
await show("openlogi_status");
await show("openlogi_dpi", {});
await show("openlogi_smartshift", { device: "MX Master" });
await show("openlogi_report_rate", { device: "MX Master" });
await show("openlogi_fn_lock", { device: "MX KEYS" });
await show("openlogi_easy_switch", { device: "MX Master" });
await show("openlogi_backlight", { device: "MX KEYS", action: "status" });
await show("openlogi_config_devices");
await c.close();

