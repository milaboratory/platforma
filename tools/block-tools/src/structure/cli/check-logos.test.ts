// Logo check: a logo that was written again as UTF-8 text is an error, any
// other unusable logo is a warning, and the commands fail only on an error.

import nodeFs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { structureCheckCommand } from "../../cmd/structure/check";
import { runRefresh } from "../../cmd/structure/refresh";
import { checkBlockLogos } from "./check-logos";

const PACKAGE_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const TEMPLATES_ROOT = path.join(PACKAGE_ROOT, "src", "structure", "templates");
const PNG = nodeFs.readFileSync(path.join(TEMPLATES_ROOT, "static/block/logos/block-logo.png"));
const DAMAGED_PNG = Buffer.from(PNG.toString("utf-8"), "utf-8");
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

let dir: string;

beforeEach(() => {
  dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), "check-logos-"));
});

afterEach(() => {
  nodeFs.rmSync(dir, { recursive: true, force: true });
});

function write(file: string, content: string | Uint8Array): void {
  nodeFs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  nodeFs.writeFileSync(path.join(dir, file), content);
}

/** A block whose facade links to `logo`; the organization logo is valid. */
function blockWithLogo(logo: unknown): void {
  write("logos/organization.png", PNG);
  write(
    "block/package.json",
    JSON.stringify({
      block: { meta: { logo, organization: { logo: "file:../logos/organization.png" } } },
    }),
  );
}

/** `severity` and the end of the message of each finding. */
function findings(): string[] {
  return checkBlockLogos(dir, ["block"]).map((f) => `${f.severity}: ${f.message.split("', ")[1]}`);
}

describe("checkBlockLogos", () => {
  test("a damaged logo is an error", () => {
    blockWithLogo("file:../logos/block.png");
    write("logos/block.png", DAMAGED_PNG);

    expect(checkBlockLogos(dir, ["block"])).toEqual([
      {
        severity: "error",
        message:
          "block.meta.logo links to 'file:../logos/block.png', but 'logos/block.png' is damaged: " +
          "a tool read it and wrote it again as UTF-8 text. Replace it with the original image file.",
      },
    ]);
  });

  test("a missing file, a directory, a link outside the block and a non-image are warnings", () => {
    write("logos/notes.txt", "not an image");
    write("logos/page.html", `<!DOCTYPE html><html><body>${SVG}</body></html>`);
    const cases: [string, string][] = [
      ["file:../logos/gone.png", "warning: but 'logos/gone.png' does not exist."],
      ["file:../logos", "warning: but 'logos' is not a file."],
      ["file:../../elsewhere.png", "warning: which is outside the block."],
      ["file:/tmp/elsewhere.png", "warning: which is outside the block."],
      [
        "file:../logos/notes.txt",
        "warning: but 'logos/notes.txt' is not a PNG, JPEG, GIF, WebP, AVIF or SVG image.",
      ],
      [
        "file:../logos/page.html",
        "warning: but 'logos/page.html' is not a PNG, JPEG, GIF, WebP, AVIF or SVG image.",
      ],
    ];
    for (const [link, expected] of cases) {
      blockWithLogo(link);
      expect(findings(), link).toEqual([expected]);
    }
  });

  test("valid images, links that are not files, and absent fields give no finding", () => {
    const longProlog = `﻿<?xml version="1.0"?>\n<!-- ${"x".repeat(5000)} -->\n<!DOCTYPE svg>\n`;
    const images: [string, string | Uint8Array][] = [
      ["a.png", PNG],
      ["a.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
      ["a.gif", "GIF89a"],
      ["a.webp", "RIFF....WEBP"],
      ["a.avif", "\0\0\0\x1cftypavif"],
      ["a.svg", longProlog + SVG],
    ];
    for (const [name, content] of images) {
      write(`logos/${name}`, content);
      blockWithLogo(`file:../logos/${name}`);
      expect(findings(), name).toEqual([]);
    }

    blockWithLogo("https://example.com/logo.png");
    expect(findings()).toEqual([]);
    blockWithLogo(undefined);
    expect(findings()).toEqual([]);
  });

  test("reads each facade path that it gets, at any location", () => {
    write("package.json", JSON.stringify({ block: { meta: { logo: "file:logos/gone.png" } } }));
    write("facade/package.json", JSON.stringify({ block: { meta: { logo: "file:gone.svg" } } }));

    expect(checkBlockLogos(dir, [])).toEqual([]);
    expect(checkBlockLogos(dir, ["", "facade"]).map((f) => f.message.split("', ")[1])).toEqual([
      "but 'logos/gone.png' does not exist.",
      "but 'facade/gone.svg' does not exist.",
    ]);
  });
});

describe("structure commands", () => {
  const SOURCE_BLOCK = path.resolve(PACKAGE_ROOT, "..", "..", "etc", "blocks", "download-file");
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  const refresh = () =>
    runRefresh({
      paths: [dir],
      isSdkInternal: true,
      updateDepsOnly: false,
      templatesRoot: TEMPLATES_ROOT,
      logger,
    });
  const check = () =>
    structureCheckCommand(PACKAGE_ROOT).parseAsync([dir, "--sdk-internal"], { from: "user" });

  beforeEach(() => {
    nodeFs.cpSync(SOURCE_BLOCK, dir, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|dist|block-pack|\.turbo)$/.test(src),
    });
  });

  test("succeed on a warning", async () => {
    nodeFs.rmSync(path.join(dir, "block/logos/block-logo.png"));

    await expect(check()).resolves.toBeDefined();
    await expect(refresh()).resolves.toBeUndefined();
  });

  test("fail on a damaged logo", async () => {
    nodeFs.writeFileSync(path.join(dir, "block/logos/block-logo.png"), DAMAGED_PNG);

    await expect(check()).rejects.toThrow(/damaged logo/);
    await expect(refresh()).rejects.toThrow(/damaged logo/);
  });
});
