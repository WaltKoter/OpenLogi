import { CliError } from "./cli.js";
import { ConfigError } from "./config.js";

export function ok(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

export function fail(message, extra) {
  const text = extra ? `${message}\n${typeof extra === "string" ? extra : JSON.stringify(extra, null, 2)}` : message;
  return { isError: true, content: [{ type: "text", text }] };
}

/** Wrap a tool handler so thrown CliError/ConfigError become clean tool errors. */
export function safe(handler) {
  return async (args, extra) => {
    try {
      return await handler(args, extra);
    } catch (e) {
      if (e instanceof CliError || e instanceof ConfigError) return fail(e.message);
      return fail(`unexpected error: ${e?.stack ?? e}`);
    }
  };
}

/** Convert an `openlogi api` envelope to a tool result. */
export function fromEnvelope(res) {
  if (res.ok) return ok(res.data);
  return fail(`${res.error?.code ?? "error"}: ${res.error?.message ?? "unknown error"}`, res.error?.persistence ? { persistence: res.error.persistence } : undefined);
}

/** Convert a plain CLI run into a tool result. */
export function fromRun(res) {
  const text = [res.stdout, res.stderr && `[stderr]\n${res.stderr}`].filter(Boolean).join("\n") || "(no output)";
  return res.code === 0 ? ok(text) : fail(`openlogi exited with code ${res.code}`, text);
}
