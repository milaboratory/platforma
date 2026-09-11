import { gunzipSync, gzipSync } from "node:zlib";
import canonicalize from "canonicalize";
import type { TemplateData } from "./template_data_v2";
import type { CompiledTemplateV3 } from "./template_data_v3";
import * as v from "valibot";

const TypeSchema = v.looseObject({
  type: v.string(),
});

const templateArchiveEncoder = new TextEncoder();
const templateArchiveDecoder = new TextDecoder();

export function parseTemplate(content: Uint8Array): TemplateData | CompiledTemplateV3 {
  const data = v.parse(TypeSchema, JSON.parse(templateArchiveDecoder.decode(gunzipSync(content))));
  if (data.type !== "pl.tengo-template.v2" && data.type !== "pl.tengo-template.v3") {
    throw new Error("malformed template");
  }

  return data as unknown as TemplateData | CompiledTemplateV3;
}

export function serializeTemplate(data: TemplateData | CompiledTemplateV3): Uint8Array {
  return gzipSync(templateArchiveEncoder.encode(canonicalize(data)), {
    chunkSize: 256 * 1024,
    level: 9,
  });
}
