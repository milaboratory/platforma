import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { argv, exit, stderr, stdin, stdout } from "node:process";

const ACCEPT = "application/json, text/event-stream";

export function defaultDiscoveryFilePath() {
  return join(homedir(), ".platforma", "mcp-server.json");
}

function report(path, cause) {
  stderr.write(`platforma-mcp-launcher: ${cause} (${path})\n`);
  return 1;
}

async function readPublished(path) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch {
    return null;
  }
}

async function answers(url) {
  try {
    const response = await fetch(url, { method: "GET", headers: { accept: ACCEPT } });
    return response.status < 500;
  } catch {
    return false;
  }
}

function toClient(message) {
  stdout.write(`${message}\n`);
}

function emitDataFrames(body) {
  for (const frame of body.split("\n")) {
    if (frame.startsWith("data:")) toClient(frame.slice(5).trim());
  }
}

async function post(url, line, sessionId) {
  const headers = { "content-type": "application/json", accept: ACCEPT };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await fetch(url, { method: "POST", headers, body: line });
  const text = await response.text();
  return {
    sessionId: response.headers.get("mcp-session-id"),
    isEventStream: (response.headers.get("content-type") ?? "").includes("text/event-stream"),
    body: text,
  };
}

async function endSession(url, sessionId) {
  try {
    await fetch(url, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId, accept: ACCEPT },
    });
  } catch {
    // the server is already gone; nothing to end
  }
}

export async function main(args) {
  const path = args[0] ?? defaultDiscoveryFilePath();

  const published = await readPublished(path);
  if (!published) {
    return report(path, "no published address — start the app and enable the MCP server");
  }
  if (!published.url) {
    return report(path, "the published file carries no address");
  }
  if (!(await answers(published.url))) {
    return report(path, "nothing answers at the published address — the app is not running");
  }

  let sessionId;
  const reader = createInterface({ input: stdin, crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    const answer = await post(published.url, line, sessionId);
    sessionId ??= answer.sessionId ?? undefined;
    if (answer.isEventStream) emitDataFrames(answer.body);
    else if (answer.body.trim()) toClient(answer.body.trim());
  }

  if (sessionId) await endSession(published.url, sessionId);
  return 0;
}

if (import.meta.url === `file://${argv[1]}`) {
  exit(await main(argv.slice(2)));
}
