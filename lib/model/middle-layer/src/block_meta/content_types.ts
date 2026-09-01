import * as v from "valibot";

//
// Canonical content types. TypeScript is the source of truth. The valibot
// schemas below are boundary validators pegged to these types via
// `satisfies`; they exist only to parse external data (`package.json`,
// registry manifests, registry overview files).
//

/** Inlined plain string (e.g. a short text snippet or markdown body). */
export type ContentExplicitString = {
  type: "explicit-string";
  content: string;
};

/** Inlined binary blob carried as base64 (e.g. a serialized logo image). */
export type ContentExplicitBase64 = {
  type: "explicit-base64";
  /** MIME type used to interpret `content`. */
  mimeType: string;
  /** Base64-encoded binary payload. */
  content: string;
};

/** Inlined binary blob carried as raw bytes. Wire form only; not used in JSON. */
export type ContentExplicitBytes = {
  type: "explicit-bytes";
  /** MIME type used to interpret `content`. */
  mimeType: string;
  content: Uint8Array;
};

/** Reference to a file by path relative to the carrying structure. */
export type ContentRelative = {
  type: "relative";
  path: string;
};

/** Reference to a file at an absolute local path. */
export type ContentAbsoluteFile = {
  type: "absolute-file";
  file: string;
};

/**
 * Reference to a folder at an absolute local path. Used for UI bundles
 * delivered as folders; the desktop "add block" dialog reads such folders on
 * demand instead of pulling every UI bundle eagerly.
 */
export type ContentAbsoluteFolder = {
  type: "absolute-folder";
  folder: string;
};

/** Reference to a file by remote URL (e.g. served from the registry). */
export type ContentAbsoluteUrl = {
  type: "absolute-url";
  url: string;
};

/** Canonical union of every content carrier shape used across the platform. */
export type Content =
  | ContentExplicitString
  | ContentExplicitBase64
  | ContentExplicitBytes
  | ContentRelative
  | ContentAbsoluteFile
  | ContentAbsoluteFolder
  | ContentAbsoluteUrl;

//
// Slot-specific content unions. Each names a set of carriers allowed in a
// particular stage of the pipeline (boundary input, manifest, resolved).
//

/** Inlined or relative-path content (text/binary inlined, or relative path). */
export type ContentExplicitOrRelative =
  | ContentExplicitString
  | ContentExplicitBase64
  | ContentRelative;

/** Any locally-resolvable content (inlined, relative path, or absolute file). */
export type ContentAnyLocal =
  | ContentExplicitString
  | ContentExplicitBase64
  | ContentRelative
  | ContentAbsoluteFile;

/** Text content available locally (inlined, relative path, or absolute file). */
export type ContentAnyTextLocal = ContentExplicitString | ContentRelative | ContentAbsoluteFile;

/** Binary content available locally (inlined base64, relative path, or absolute file). */
export type ContentAnyBinaryLocal = ContentExplicitBase64 | ContentRelative | ContentAbsoluteFile;

/** Binary content fully resolved (inlined base64 or absolute file). */
export type ContentAbsoluteBinaryLocal = ContentExplicitBase64 | ContentAbsoluteFile;

/** Text content fully resolved (inlined string or absolute file). */
export type ContentAbsoluteTextLocal = ContentExplicitString | ContentAbsoluteFile;

/** Binary content in manifest form (inlined base64 or path relative to the manifest). */
export type ContentRelativeBinary = ContentExplicitBase64 | ContentRelative;

/** Text content in manifest form (inlined string or path relative to the manifest). */
export type ContentRelativeText = ContentExplicitString | ContentRelative;

//
// Valibot schemas — boundary validators only. The TS types above are the
// source of truth; each schema is pegged via `satisfies v.GenericSchema<T>`.
// Only the schemas referenced by sibling boundary files (`block_meta.ts`,
// `block_manifest.ts`) are exported.
//

const absPathRegex = new RegExp(`^(/|[A-Z]:\\\\)`);

const contentExplicitStringSchema = v.strictObject({
  type: v.literal("explicit-string"),
  content: v.string(),
}) satisfies v.GenericSchema<ContentExplicitString>;

export const ContentExplicitBase64 = v.strictObject({
  type: v.literal("explicit-base64"),
  mimeType: v.pipe(v.string(), v.regex(/\w+\/[-+.\w]+/)),
  content: v.pipe(v.string(), v.base64()),
}) satisfies v.GenericSchema<ContentExplicitBase64>;

export const ContentExplicitBytes = v.strictObject({
  type: v.literal("explicit-bytes"),
  mimeType: v.pipe(v.string(), v.regex(/\w+\/[-+.\w]+/)),
  content: v.instance(Uint8Array),
}) satisfies v.GenericSchema<ContentExplicitBytes>;

export const ContentRelative = v.strictObject({
  type: v.literal("relative"),
  path: v.string(),
}) satisfies v.GenericSchema<ContentRelative>;

const contentAbsoluteFileSchema = v.strictObject({
  type: v.literal("absolute-file"),
  file: v.pipe(v.string(), v.regex(absPathRegex, "path to file must be absolute")),
}) satisfies v.GenericSchema<ContentAbsoluteFile>;

export const ContentRelativeBinary = v.variant("type", [
  ContentExplicitBase64,
  ContentRelative,
]) satisfies v.GenericSchema<ContentRelativeBinary>;

export const ContentRelativeText = v.variant("type", [
  contentExplicitStringSchema,
  ContentRelative,
]) satisfies v.GenericSchema<ContentRelativeText>;

//
// Boundary normalizing transforms — parse the loose forms authors write in
// `package.json`. Bare strings with the `file:` prefix become a
// `ContentRelative`; bare strings without the prefix become a
// `ContentExplicitString` (text only).
//

export const DescriptionContentBinary = v.union([
  v.pipe(
    v.string(),
    v.startsWith("file:"),
    v.transform(
      (value): ContentRelativeBinary => ({
        type: "relative",
        path: value.slice(5),
      }),
    ),
  ),
  v.variant("type", [ContentExplicitBase64, ContentRelative, contentAbsoluteFileSchema]),
]) satisfies v.GenericSchema<unknown, ContentAnyBinaryLocal>;

export const DescriptionContentText = v.union([
  v.pipe(
    v.string(),
    v.transform((value): ContentRelativeText => {
      if (value.startsWith("file:")) return { type: "relative", path: value.slice(5) };
      return { type: "explicit-string", content: value };
    }),
  ),
  v.variant("type", [contentExplicitStringSchema, ContentRelative, contentAbsoluteFileSchema]),
]) satisfies v.GenericSchema<unknown, ContentAnyTextLocal>;
