import { constants, gunzipSync, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import canonicalize from "canonicalize";
import type { TemplateData } from "./template_data_v2";
import type { CompiledTemplateV3 } from "./template_data_v3";
import type { CompiledTemplateV4 } from "./template_data_v4";
import { z } from "zod";

const TypeSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

const templateArchiveEncoder = new TextEncoder();
const templateArchiveDecoder = new TextDecoder();

// Level 19 rather than the default 3. Packs are written once at block build
// time and read on every install, so compression time is close to free and
// decompression is what repeats. On a real block: 171 KB at level 3, 132 KB at
// level 19; level 22 saves a further 128 bytes for 40 % more compression time.
const zstdLevel = 19;

/**
 * How a template pack is compressed. The file extension is the source of
 * truth: `.plj.zst` is zstd, `.plj.gz` is gzip. Packs published before the
 * switch are gzip and stay reachable under their original name, so both
 * codecs are readable indefinitely.
 *
 * Carried explicitly rather than detected from the bytes. A pack always
 * arrives from somewhere that knows its name — a file path, or a registry
 * URL — and threading that through keeps the extension meaningful instead of
 * decorative.
 */
export type TemplateCodec = "gzip" | "zstd";

export const TemplatePackSuffix = ".plj.zst";

/** Codec a pack file uses, from its name. */
export function templateCodecForPath(path: string): TemplateCodec {
  return path.endsWith(".zst") ? "zstd" : "gzip";
}

export function decompressTemplate(content: Uint8Array, codec: TemplateCodec): Buffer {
  return codec === "zstd" ? zstdDecompressSync(content) : gunzipSync(content);
}

export type AnyCompiledTemplate = TemplateData | CompiledTemplateV3 | CompiledTemplateV4;

export function parseTemplate(content: Uint8Array, codec: TemplateCodec): AnyCompiledTemplate {
  const data = TypeSchema.parse(
    JSON.parse(templateArchiveDecoder.decode(decompressTemplate(content, codec))),
  );
  if (
    data.type !== "pl.tengo-template.v2" &&
    data.type !== "pl.tengo-template.v3" &&
    data.type !== "pl.tengo-template.v4"
  ) {
    throw new Error("malformed template");
  }

  return data as unknown as AnyCompiledTemplate;
}

export function serializeTemplate(data: AnyCompiledTemplate): Uint8Array {
  return zstdCompressSync(templateArchiveEncoder.encode(canonicalize(data)), {
    params: { [constants.ZSTD_c_compressionLevel]: zstdLevel },
  });
}
