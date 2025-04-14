import { gunzipSync, gzipSync } from 'node:zlib';
import canonicalize from 'canonicalize';
import { TemplateData } from './template_data_v2';
import { CompiledTemplateV3 } from './template_data_v3';
import { z } from 'zod';

const TypeSchema = z.object({
  type: z.string(),
}).passthrough();

const templateArchiveEncoder = new TextEncoder();
const templateArchiveDecoder = new TextDecoder();

export function parseTemplate(content: Uint8Array): TemplateData | CompiledTemplateV3 {
  const data = TypeSchema.parse(JSON.parse(templateArchiveDecoder.decode(gunzipSync(content))));
  if (data.type !== 'pl.tengo-template.v2' &&
    data.type !== 'pl.tengo-template.v3') {
    throw new Error('malformed template');
  }

  return data as unknown as TemplateData | CompiledTemplateV3;
}

export function serializeTemplate(data: TemplateData | CompiledTemplateV3): Uint8Array {
  return gzipSync(templateArchiveEncoder.encode(canonicalize(data)), { chunkSize: 256 * 1024, level: 9 });
}
