import { expect, test } from "vitest";
import { folderReaderByUrl, redactUrl } from "./folder_reader";

test("test fs reader", async () => {
  const reader = folderReaderByUrl("file:.");
  const content = await reader.getContentReader()("package.json");
  expect(content).toBeDefined();
  expect(content.length).toBeGreaterThan(10);
});

test("test url reader with slash", async () => {
  const reader = folderReaderByUrl("https://cdn.milaboratory.com/");
  const content = await reader.getContentReader()("ping");
  expect(content?.toString("utf8")).toStrictEqual("pong");
});

test("test url reader without slash", async () => {
  const reader = folderReaderByUrl("https://cdn.milaboratory.com");
  const content = await reader.getContentReader()("ping");
  expect(content?.toString("utf8")).toStrictEqual("pong");
});

test("test url reader rejects non-2xx responses", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((req, res) => {
    if (req.url === "/ok.txt") res.writeHead(200).end("content");
    else res.writeHead(404).end("<Error><Code>NoSuchKey</Code></Error>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("no port");
    const reader = folderReaderByUrl(`http://127.0.0.1:${address.port}/`);
    expect((await reader.readFile("ok.txt")).toString()).toEqual("content");
    await expect(reader.readFile("missing.json")).rejects.toThrow(/HTTP 404/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("redactUrl drops credentials and query from error messages", () => {
  expect(
    redactUrl(new URL("https://user:secret@registry.example/v2/a.json?X-Goog-Signature=abc#f")),
  ).toEqual("https://registry.example/v2/a.json");
});
