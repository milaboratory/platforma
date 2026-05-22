import { z } from "zod";

//
// Canonical content union — single source of truth for TS types
//

export type Content =
  | { type: "explicit-string"; content: string }
  | { type: "explicit-base64"; mimeType: string; content: string }
  | { type: "explicit-bytes"; mimeType: string; content: Uint8Array }
  | { type: "relative"; path: string }
  | { type: "absolute-file"; file: string }
  | { type: "absolute-folder"; folder: string }
  | { type: "absolute-url"; url: string };

//
// Leaf types — extracted from canonical Content union
//

export type ContentExplicitString = Extract<Content, { type: "explicit-string" }>;
export type ContentExplicitBase64 = Extract<Content, { type: "explicit-base64" }>;
export type ContentExplicitBytes = Extract<Content, { type: "explicit-bytes" }>;
export type ContentRelative = Extract<Content, { type: "relative" }>;
export type ContentAbsoluteFile = Extract<Content, { type: "absolute-file" }>;
export type ContentAbsoluteFolder = Extract<Content, { type: "absolute-folder" }>;
export type ContentAbsoluteUrl = Extract<Content, { type: "absolute-url" }>;

//
// Union types — extracted from canonical Content union
//

export type ContentAny = Extract<
  Content,
  { type: "explicit-string" | "explicit-base64" | "relative" | "absolute-file" | "absolute-url" }
>;
export type ContentExplicitOrRelative = Extract<
  Content,
  { type: "explicit-string" | "explicit-base64" | "relative" }
>;
export type ContentAnyLocal = Extract<
  Content,
  { type: "explicit-string" | "explicit-base64" | "relative" | "absolute-file" }
>;
export type ContentAnyRemote = Extract<
  Content,
  { type: "explicit-string" | "explicit-base64" | "relative" | "absolute-url" }
>;
export type ContentAnyBinaryLocal = Extract<
  Content,
  { type: "explicit-base64" | "relative" | "absolute-file" }
>;
export type ContentAnyTextLocal = Extract<
  Content,
  { type: "explicit-string" | "relative" | "absolute-file" }
>;
export type ContentAbsoluteBinaryRemote = Extract<
  Content,
  { type: "explicit-base64" | "absolute-url" }
>;
export type ContentAbsoluteBinaryLocal = Extract<
  Content,
  { type: "explicit-base64" | "absolute-file" }
>;
export type ContentAbsoluteTextRemote = Extract<
  Content,
  { type: "explicit-string" | "absolute-url" }
>;
export type ContentAbsoluteTextLocal = Extract<
  Content,
  { type: "explicit-string" | "absolute-file" }
>;
export type ContentRelativeBinary = Extract<Content, { type: "explicit-base64" | "relative" }>;
export type ContentRelativeText = Extract<Content, { type: "explicit-string" | "relative" }>;

//
// Leaf schemas (pegged to TS types via `satisfies`)
//

const absPathRegex = new RegExp(`^(/|[A-Z]:\\\\)`);

export const ContentExplicitString = z
  .object({
    type: z.literal("explicit-string"),
    content: z.string().describe("Actual string value"),
  })
  .strict() satisfies z.ZodType<ContentExplicitString>;

export const ContentExplicitBase64 = z
  .object({
    type: z.literal("explicit-base64"),
    mimeType: z
      .string()
      .regex(/\w+\/[-+.\w]+/)
      .describe("MIME type to interpret content"),
    content: z.string().base64().describe("Base64 encoded binary value"),
  })
  .strict() satisfies z.ZodType<ContentExplicitBase64>;

export const ContentExplicitBytes = z
  .object({
    type: z.literal("explicit-bytes"),
    mimeType: z
      .string()
      .regex(/\w+\/[-+.\w]+/)
      .describe("MIME type to interpret content"),
    content: z.instanceof(Uint8Array).describe("Raw content"),
  })
  .strict() satisfies z.ZodType<ContentExplicitBytes>;

export const ContentRelative = z
  .object({
    type: z.literal("relative"),
    path: z
      .string()
      .describe(
        "Address of the file, in most cases relative to the file which this structure is a part of",
      ),
  })
  .strict() satisfies z.ZodType<ContentRelative>;

export const ContentAbsoluteFile = z
  .object({
    type: z.literal("absolute-file"),
    file: z
      .string()
      .regex(absPathRegex, "path to file must be absolute")
      .describe("Absolute address of the file in local file system"),
  })
  .strict() satisfies z.ZodType<ContentAbsoluteFile>;

export const ContentAbsoluteFolder = z
  .object({
    type: z.literal("absolute-folder"),
    folder: z
      .string()
      .regex(absPathRegex, "path to folder must be absolute")
      .describe("Absolute address of the folder in local file system"),
  })
  .strict() satisfies z.ZodType<ContentAbsoluteFolder>;

export const ContentAbsoluteUrl = z
  .object({
    type: z.literal("absolute-url"),
    url: z.string().url().describe("Global URL to reach the requested file"),
  })
  .strict() satisfies z.ZodType<ContentAbsoluteUrl>;

//
// Union schemas retained as nested validators inside boundary schemas.
// Other Content* union schemas (ContentAny, ContentAnyLocal, ContentAbsoluteBinaryLocal, etc.)
// are dropped — only their TS types above survive.
//

export const ContentAnyBinaryLocal = z.discriminatedUnion("type", [
  ContentExplicitBase64,
  ContentRelative,
  ContentAbsoluteFile,
]) satisfies z.ZodType<ContentAnyBinaryLocal>;

export const ContentAnyTextLocal = z.discriminatedUnion("type", [
  ContentExplicitString,
  ContentRelative,
  ContentAbsoluteFile,
]) satisfies z.ZodType<ContentAnyTextLocal>;

export const ContentRelativeBinary = z.discriminatedUnion("type", [
  ContentExplicitBase64,
  ContentRelative,
]) satisfies z.ZodType<ContentRelativeBinary>;

export const ContentRelativeText = z.discriminatedUnion("type", [
  ContentExplicitString,
  ContentRelative,
]) satisfies z.ZodType<ContentRelativeText>;

//
// Boundary normalizing transforms — used only when parsing untrusted
// `package.json` content. Authors write either a bare string
// (`"file:./logo.png"` or just `"hello"`) or a wrapped object;
// the schema coerces both to the canonical object form.
//

export const DescriptionContentBinary = z.union([
  z
    .string()
    .startsWith("file:")
    .transform<ContentRelativeBinary>((value) => ({ type: "relative", path: value.slice(5) })),
  ContentAnyBinaryLocal,
]) satisfies z.ZodType<ContentAnyBinaryLocal, z.ZodTypeDef, any>;

export const DescriptionContentText = z.union([
  z.string().transform<ContentRelativeText>((value) => {
    if (value.startsWith("file:")) return { type: "relative", path: value.slice(5) };
    else return { type: "explicit-string", content: value };
  }),
  ContentAnyTextLocal,
]) satisfies z.ZodType<ContentAnyTextLocal, z.ZodTypeDef, any>;
