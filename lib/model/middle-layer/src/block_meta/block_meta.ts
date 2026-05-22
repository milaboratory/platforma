import { z } from "zod";
import {
  ContentExplicitBase64,
  ContentExplicitBytes,
  DescriptionContentBinary,
  DescriptionContentText,
} from "./content_types";

export const BlockPlatform = z.enum([
  "windows-x64",
  "windows-aarch64",
  "macosx-x64",
  "macosx-aarch64",
  "linux-x64",
  "linux-aarch64",
]);
export type BlockPlatform = z.infer<typeof BlockPlatform>;

/**
 * TS generic shape of any BlockPackMeta variant — parameterized by the
 * representation of long-string and binary content fields. Mirrors the
 * structure produced by the `BlockPackMeta(...)` Zod factory below; both
 * stay in sync.
 */
export type BlockPackMeta<LongString, Binary> = {
  title: string;
  description: string;
  longDescription?: LongString;
  changelog?: LongString;
  logo?: Binary;
  url?: string;
  docs?: string;
  support?: string;
  tags?: string[];
  organization: {
    name: string;
    url: string;
    logo?: Binary;
  } & { [k: string]: unknown };
  marketplaceRanking?: number;
  deprecated?: boolean;
  termsOfServiceUrl?: string;
  supportedPlatforms?: BlockPlatform[];
  requiredCapabilities?: string[];
} & { [k: string]: unknown };

export function BlockPackMeta<
  const LongStringType extends z.ZodTypeAny,
  const BinaryType extends z.ZodTypeAny,
>(longString: LongStringType, binary: BinaryType) {
  return z
    .object({
      title: z.string(),
      description: z.string(),
      longDescription: longString.optional(),
      changelog: longString.optional(),
      logo: binary.optional(),
      url: z.string().url().optional(),
      docs: z.string().url().optional(),
      support: z.union([z.string().url(), z.string().email()]).optional(),
      tags: z.array(z.string()).optional(),
      organization: z
        .object({
          name: z.string(),
          url: z.string().url(),
          logo: binary.optional(),
        })
        .passthrough(),
      /**
       * The order of blocks on the "marketplace" (higher values push block higher to the top of the list).
       * `undefined` value or absent field is treated exactly the same as number `0`.
       */
      marketplaceRanking: z.number().optional(),
      /**
       * If true, the block is deprecated and should not be used.
       */
      deprecated: z.boolean().optional(),
      /**
       * The URL to the Terms of Service for the block. If provided checkbox with link to this URL should be shown in order to add block.
       */
      termsOfServiceUrl: z.string().url().optional(),
      /**
       * Supported operating systems.
       * If not provided, the block is supported on all operating systems.
       */
      supportedPlatforms: z.array(BlockPlatform).optional(),
      /**
       * Runtime capabilities the block needs from the backend (e.g.
       * "wasm:v1"). Desktop refuses to install if any listed token is
       * missing from the backend's `serverInfo.capabilities`.
       *
       * Tokens follow the backend's `<feature>:<version>` format defined in
       * `core/pl/platform/api/plapiserver/server_capabilities.go`. The
       * schema itself accepts loose strings (not an enum) so future
       * capabilities don't break Desktops that ship before each token is
       * added — the same forward-compat property `BlockPackMeta` itself
       * enjoys at the field level, applied recursively at the token level.
       */
      requiredCapabilities: z.array(z.string()).optional(),
    })
    .passthrough();
  // `.passthrough()` preserves unknown sibling keys through `parse`/round-trip.
  // Without it, a block-tools version that predates a newly-added meta field
  // would strip that field on every registry-mutating command (mark-stable,
  // refresh-registry, restore-overview-from-snapshot) — silently undoing
  // publishes. Combined with the `require-latest @platforma-sdk/block-tools`
  // CI gate, this future-proofs the schema for all subsequent field additions.
}

export const BlockPackMetaDescriptionRaw = BlockPackMeta(
  DescriptionContentText,
  DescriptionContentBinary,
);
export type BlockPackMetaDescriptionRaw = z.infer<typeof BlockPackMetaDescriptionRaw>;

export const BlockPackMetaEmbeddedBase64 = BlockPackMeta(z.string(), ContentExplicitBase64);
export type BlockPackMetaEmbeddedBase64 = z.infer<typeof BlockPackMetaEmbeddedBase64>;

export const BlockPackMetaEmbeddedBytes = BlockPackMeta(z.string(), ContentExplicitBytes);
export type BlockPackMetaEmbeddedBytes = z.infer<typeof BlockPackMetaEmbeddedBytes>;
