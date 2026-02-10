import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = input instanceof URL ? input : new URL(String(input));

  if (url.protocol === "file:") {
    const buffer = await readFile(fileURLToPath(url));
    return new Response(buffer, {
      headers: { "Content-Type": "application/wasm" },
    });
  }

  return originalFetch(input, init);
};
