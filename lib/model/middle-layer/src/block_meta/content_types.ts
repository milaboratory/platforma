import { z } from 'zod';

//
// Base content types
//

export const ContentExplicitString = z
  .object({
    type: z.literal('explicit-string'),
    content: z.string().describe('Actual string value')
  })
  .strict();
export type ContentExplicitString = z.infer<typeof ContentExplicitString>;

export const ContentExplicitBase64 = z
  .object({
    type: z.literal('explicit-base64'),
    mimeType: z
      .string()
      .regex(/\w+\/[-+.\w]+/)
      .describe('MIME type to interpret content'),
    content: z.string().base64().describe('Base64 encoded binary value')
  })
  .strict();
export type ContentExplicitBase64 = z.infer<typeof ContentExplicitBase64>;

export const ContentRelative = z
  .object({
    type: z.literal('relative'),
    path: z
      .string()
      .describe(
        'Address of the file, in most cases relative to the file which this structure is a part of'
      )
  })
  .strict();
export type ContentRelative = z.infer<typeof ContentRelative>;

const absPathRegex = new RegExp(`^(/|[A-Z]:\\\\)`);

export const ContentAbsoluteFile = z
  .object({
    type: z.literal('absolute-file'),
    file: z
      .string()
      .regex(absPathRegex, 'path to file must be absolute')
      .describe('Absolute address of the file in local file system')
  })
  .strict();
export type ContentAbsoluteFile = z.infer<typeof ContentAbsoluteFile>;

export const ContentAbsoluteUrl = z
  .object({
    type: z.literal('absolute-url'),
    url: z.string().url().describe('Global URL to reach the requested file')
  })
  .strict();
export type ContentAbsoluteUrl = z.infer<typeof ContentAbsoluteUrl>;

//
// Special content types
//

export const ContentExplicitBytes = z
  .object({
    type: z.literal('explicit-bytes'),
    mimeType: z
      .string()
      .regex(/\w+\/[-+.\w]+/)
      .describe('MIME type to interpret content'),
    content: z.instanceof(Uint8Array).describe('Raw content')
  })
  .strict();
export type ContentExplicitBytes = z.infer<typeof ContentExplicitBytes>;

export const ContentAbsoluteFolder = z
  .object({
    type: z.literal('absolute-folder'),
    folder: z
      .string()
      .regex(absPathRegex, 'path to folder must be absolute')
      .describe('Absolute address of the folder in local file system')
  })
  .strict();
export type ContentAbsoluteFolder = z.infer<typeof ContentAbsoluteFolder>;

//
// Unions
//

export const ContentAny = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentExplicitBase64,
  ContentRelative,
  ContentAbsoluteFile,
  ContentAbsoluteUrl
]);
export type ContentAny = z.infer<typeof ContentAny>;

export const ContentExplicitOrRelative = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentExplicitBase64,
  ContentRelative
]);
export type ContentExplicitOrRelative = z.infer<typeof ContentExplicitOrRelative>;

export const ContentAnyLocal = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentExplicitBase64,
  ContentRelative,
  ContentAbsoluteFile
]);
export type ContentAnyLocal = z.infer<typeof ContentAnyLocal>;

export const ContentAnyRemote = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentExplicitBase64,
  ContentRelative,
  ContentAbsoluteUrl
]);
export type ContentAnyRemote = z.infer<typeof ContentAnyRemote>;

//
// Narrow types with relative option
//

// export const ContentAnyBinaryRemote = z.discriminatedUnion('type', [
//   ContentExplicitBase64,
//   ContentRelative,
//   ContentAbsoluteUrl
// ]);
// export type ContentAnyBinaryRemote = z.infer<typeof ContentAnyBinaryRemote>;

export const ContentAnyBinaryLocal = z.discriminatedUnion('type', [
  ContentExplicitBase64,
  ContentRelative,
  ContentAbsoluteFile
]);
export type ContentAnyBinaryLocal = z.infer<typeof ContentAnyBinaryLocal>;

// export const ContentAnyTextRemote = z.discriminatedUnion('type', [
//   ContentExplicitString,
//   ContentRelative,
//   ContentAbsoluteUrl
// ]);
// export type ContentAnyTextRemote = z.infer<typeof ContentAnyTextRemote>;

export const ContentAnyTextLocal = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentRelative,
  ContentAbsoluteFile
]);
export type ContentAnyTextLocal = z.infer<typeof ContentAnyTextLocal>;

//
// Narrow absolute types
//

export const ContentAbsoluteBinaryRemote = z.discriminatedUnion('type', [
  ContentExplicitBase64,
  ContentAbsoluteUrl
]);
export type ContentAbsoluteBinaryRemote = z.infer<typeof ContentAbsoluteBinaryRemote>;

export const ContentAbsoluteBinaryLocal = z.discriminatedUnion('type', [
  ContentExplicitBase64,
  ContentAbsoluteFile
]);
export type ContentAbsoluteBinaryLocal = z.infer<typeof ContentAbsoluteBinaryLocal>;

export const ContentAbsoluteTextRemote = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentAbsoluteUrl
]);
export type ContentAbsoluteTextRemote = z.infer<typeof ContentAbsoluteTextRemote>;

export const ContentAbsoluteTextLocal = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentAbsoluteFile
]);
export type ContentAbsoluteTextLocal = z.infer<typeof ContentAbsoluteTextLocal>;

//
// Narrow relative types
//

export const ContentRelativeBinary = z.discriminatedUnion('type', [
  ContentExplicitBase64,
  ContentRelative
]);
export type ContentRelativeBinary = z.infer<typeof ContentRelativeBinary>;

export const ContentRelativeText = z.discriminatedUnion('type', [
  ContentExplicitString,
  ContentRelative
]);
export type ContentRelativeText = z.infer<typeof ContentRelativeText>;

// export function ConstructContent(
//   contentType: 'text',
//   contextType: 'local'
// ): typeof ContentAnyTextLocal;
// export function ConstructContent(
//   contentType: 'text',
//   contextType: 'remote'
// ): typeof ContentAnyTextRemote;
// export function ConstructContent(
//   contentType: 'binary',
//   contextType: 'local'
// ): typeof ContentAnyBinaryLocal;
// export function ConstructContent(
//   contentType: 'binary',
//   contextType: 'remote'
// ): typeof ContentAnyBinaryRemote;
// export function ConstructContent(
//   contentType: ContentType,
//   contextType: ContextType
// ):
//   | typeof ContentAnyTextLocal
//   | typeof ContentAnyTextRemote
//   | typeof ContentAnyBinaryLocal
//   | typeof ContentAnyBinaryRemote;
// export function ConstructContent(contentType: ContentType, contextType: ContextType) {
//   return contentType === 'text'
//     ? contextType === 'local'
//       ? ContentAnyTextLocal
//       : ContentAnyTextRemote
//     : contextType === 'local'
//       ? ContentAnyBinaryLocal
//       : ContentAnyBinaryRemote;
// }

export const DescriptionContentBinary = z.union([
  z
    .string()
    .startsWith('file:')
    .transform<ContentRelativeBinary>((value, ctx) => ({ type: 'relative', path: value.slice(5) })),
  ContentAnyBinaryLocal
]);
export type DescriptionContentBinary = z.infer<typeof DescriptionContentBinary>;

export const DescriptionContentText = z.union([
  z.string().transform<ContentRelativeText>((value, ctx) => {
    if (value.startsWith('file:')) return { type: 'relative', path: value.slice(5) };
    else return { type: 'explicit-string', content: value };
  }),
  ContentAnyTextLocal
]);
export type DescriptionContentText = z.infer<typeof DescriptionContentText>;
