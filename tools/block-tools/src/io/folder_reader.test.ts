import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test } from "vitest";
import { folderReaderByUrl } from "./folder_reader";

const server = createServer((req, res) => {
  if (req.url === "/base/ping") {
    res.end("pong");
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});
let baseUrl = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/base`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test("test fs reader", async () => {
  const reader = folderReaderByUrl("file:.");
  const content = await reader.getContentReader()("package.json");
  expect(content).toBeDefined();
  expect(content.length).toBeGreaterThan(10);
});

test("test url reader with slash", async () => {
  const reader = folderReaderByUrl(`${baseUrl}/`);
  const content = await reader.getContentReader()("ping");
  expect(content?.toString("utf8")).toStrictEqual("pong");
});

test("test url reader without slash", async () => {
  const reader = folderReaderByUrl(baseUrl);
  const content = await reader.getContentReader()("ping");
  expect(content?.toString("utf8")).toStrictEqual("pong");
});
