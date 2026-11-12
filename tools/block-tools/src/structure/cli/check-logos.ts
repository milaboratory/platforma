// Logo check for `structure check` and `structure refresh`. Reads the block
// directly; it is not a structurer rule and changes no file.

import fs from "node:fs";
import path from "node:path";

export type LogoFinding = { severity: "error" | "warning"; message: string };

/** Examine the files that `block.meta.logo` and `block.meta.organization.logo`
 *  link to with `file:`. A logo that was read and written again as UTF-8 text
 *  is an error: no image viewer can open it. Any other unusable logo is a
 *  warning. `facadePaths` are the block-relative paths of the facade packages
 *  that discovery found. */
export function checkBlockLogos(blockRoot: string, facadePaths: string[]): LogoFinding[] {
  return facadePaths.flatMap((facadePath) => {
    const facadeDir = path.resolve(blockRoot, facadePath);
    const meta = blockMeta(path.join(facadeDir, "package.json"));
    const links: [string, unknown][] = [
      ["block.meta.logo", property(meta, "logo")],
      ["block.meta.organization.logo", property(property(meta, "organization"), "logo")],
    ];
    return links.flatMap(([field, link]) =>
      typeof link === "string" && link.startsWith("file:")
        ? checkLogo(blockRoot, facadeDir, field, link)
        : [],
    );
  });
}

function checkLogo(
  blockRoot: string,
  facadeDir: string,
  field: string,
  link: string,
): LogoFinding[] {
  const warning = (text: string): LogoFinding[] => [
    { severity: "warning", message: `${field} links to '${link}', ${text}` },
  ];
  // Same resolution as the pack step: relative to the facade package.
  const file = path.resolve(facadeDir, link.slice("file:".length));
  const shown = path.relative(blockRoot, file);
  if (shown.startsWith("..") || path.isAbsolute(shown))
    return warning("which is outside the block.");
  const stat = fs.statSync(file, { throwIfNoEntry: false });
  if (stat === undefined) return warning(`but '${shown}' does not exist.`);
  if (!stat.isFile()) return warning(`but '${shown}' is not a file.`);

  const bytes = fs.readFileSync(file);
  if (startsWith(bytes, [0xef, 0xbf, 0xbd])) {
    return [
      {
        severity: "error",
        message:
          `${field} links to '${link}', but '${shown}' is damaged: a tool read it and wrote ` +
          `it again as UTF-8 text. Replace it with the original image file.`,
      },
    ];
  }
  if (isImage(bytes)) return [];
  return warning(`but '${shown}' is not a PNG, JPEG, GIF, WebP, AVIF or SVG image.`);
}

/** `block.meta` of the `package.json` at `file`, when the file has one. */
function blockMeta(file: string): unknown {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) return undefined;
  return property(property(JSON.parse(fs.readFileSync(file, "utf-8")), "block"), "meta");
}

function property(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.entries(value).find(([k]) => k === key)?.[1];
}

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((byte, i) => bytes[offset + i] === byte);
}

function ascii(text: string): number[] {
  return Array.from(text, (ch) => ch.charCodeAt(0));
}

/** What may come before the root element of an XML document. */
const XML_PROLOG = /^(?:\s+|<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>)*/i;

function isImage(bytes: Uint8Array): boolean {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return true; // PNG
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return true; // JPEG
  if (startsWith(bytes, ascii("GIF8"))) return true;
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return true;
  if (startsWith(bytes, ascii("ftypavi"), 4)) return true; // AVIF: brand avif or avis
  // SVG: the root element of the document is `svg`.
  // TextDecoder removes a byte-order mark.
  const text = new TextDecoder("utf-8").decode(bytes);
  return /^<svg[\s/>]/.test(text.slice(XML_PROLOG.exec(text)?.[0].length));
}
