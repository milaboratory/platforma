import * as v from "valibot";
import {
  ContentExplicitBase64,
  ContentExplicitBytes,
  DescriptionContentBinary,
  DescriptionContentText,
} from "./content_types";

export const BlockPlatform = v.picklist([
  "windows-x64",
  "windows-aarch64",
  "macosx-x64",
  "macosx-aarch64",
  "linux-x64",
  "linux-aarch64",
]);
export type BlockPlatform = v.InferOutput<typeof BlockPlatform>;

/**
 * Static metadata a block author ships: title, descriptions, logos, social
 * links, and capability requirements. Parameterized by the carriers used for
 * long-string fields (`LongString`) and binary fields (`Binary`); the same
 * shape carries `package.json` form (loose strings), manifest form (relative
 * paths), and embedded form (inlined base64 or bytes).
 *
 * Forward-compatibility: the boundary valibot schemas (`BlockPackMeta(...)` and
 * `organization`) use `v.looseObject` so that unknown sibling fields survive
 * parse/round-trip verbatim. A registry mutator that predates a new meta
 * field must not silently strip it (otherwise mark-stable / refresh-overview
 * / restore-overview would quietly undo publishes). Code consuming these
 * objects sees only the known fields listed below; the schemas guard the
 * round-trip behavior. Combined with the `require-latest @platforma-sdk/block-tools`
 * CI gate, this future-proofs every subsequent field addition.
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
  };
  marketplaceRanking?: number;
  deprecated?: boolean;
  termsOfServiceUrl?: string;
  supportedPlatforms?: BlockPlatform[];
  requiredCapabilities?: string[];
};

export function BlockPackMeta<
  const LongStringType extends v.GenericSchema,
  const BinaryType extends v.GenericSchema,
>(longString: LongStringType, binary: BinaryType) {
  return v.looseObject({
    title: v.string(),
    description: v.string(),
    longDescription: v.optional(longString),
    changelog: v.optional(longString),
    logo: v.optional(binary),
    url: v.optional(v.pipe(v.string(), v.url())),
    docs: v.optional(v.pipe(v.string(), v.url())),
    support: v.optional(v.union([v.pipe(v.string(), v.url()), v.pipe(v.string(), v.email())])),
    tags: v.optional(v.array(v.string())),
    organization: v.looseObject({
      name: v.string(),
      url: v.pipe(v.string(), v.url()),
      logo: v.optional(binary),
    }),
    /**
     * The order of blocks on the "marketplace" (higher values push block higher to the top of the list).
     * `undefined` value or absent field is treated exactly the same as number `0`.
     */
    marketplaceRanking: v.optional(v.number()),
    /**
     * If true, the block is deprecated and should not be used.
     */
    deprecated: v.optional(v.boolean()),
    /**
     * The URL to the Terms of Service for the block. If provided checkbox with link to this URL should be shown in order to add block.
     */
    termsOfServiceUrl: v.optional(v.pipe(v.string(), v.url())),
    /**
     * Supported operating systems.
     * If not provided, the block is supported on all operating systems.
     */
    supportedPlatforms: v.optional(v.array(BlockPlatform)),
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
    requiredCapabilities: v.optional(v.array(v.string())),
  });
  // `v.looseObject` is intentional — see forward-compat note on
  // `BlockPackMeta` type above.
}

export const BlockPackMetaDescriptionRaw = BlockPackMeta(
  DescriptionContentText,
  DescriptionContentBinary,
);
export type BlockPackMetaDescriptionRaw = v.InferOutput<typeof BlockPackMetaDescriptionRaw>;

export const BlockPackMetaEmbeddedBase64 = BlockPackMeta(v.string(), ContentExplicitBase64);
export type BlockPackMetaEmbeddedBase64 = v.InferOutput<typeof BlockPackMetaEmbeddedBase64>;

export const BlockPackMetaEmbeddedBytes = BlockPackMeta(v.string(), ContentExplicitBytes);
export type BlockPackMetaEmbeddedBytes = v.InferOutput<typeof BlockPackMetaEmbeddedBytes>;
