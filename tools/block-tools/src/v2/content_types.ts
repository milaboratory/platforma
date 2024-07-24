import { z } from 'zod';
import { ContentType, ContextType } from './common';

export const ContentExplicitString = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('explicit-string'),
      content: z.string().describe('Actual string value')
    })
    .strict()
]);
export type ContentExplicitString = z.infer<typeof ContentExplicitString>;

export const ContentExplicitBase64 = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('explicit-base64'),
      content: z.string().base64().describe('Base64 encoded binary value')
    })
    .strict()
]);
export type ContentExplicitBase64 = z.infer<typeof ContentExplicitBase64>;

export const ContentExplicit = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('explicit'),
      content: z.instanceof(Uint8Array).describe('Raw content')
    })
    .strict()
]);
export type ContentExplicit = z.infer<typeof ContentExplicit>;

export const ContentRelative = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('relative'),
      path: z
        .string()
        .describe(
          'Address of the file, in most cases relative to the file which this structure is a part of'
        )
    })
    .strict()
]);
export type ContentRelative = z.infer<typeof ContentRelative>;

export const ContentAbsoluteFile = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('absolute-file'),
      file: z.string().startsWith('/').describe('Absolute address of the file in local file system')
    })
    .strict()
]);
export type ContentAbsoluteFile = z.infer<typeof ContentAbsoluteFile>;

export const ContentAbsoluteFolder = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('absolute-folder'),
      folder: z
        .string()
        .startsWith('/')
        .describe('Absolute address of the folder in local file system')
    })
    .strict()
]);
export type ContentAbsoluteFolder = z.infer<typeof ContentAbsoluteFolder>;

export const ContentAbsoluteUrl = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('absolute-url'),
      url: z.string().url().describe('Global URL to reach the requested file')
    })
    .strict()
]);
export type ContentAbsoluteUrl = z.infer<typeof ContentAbsoluteUrl>;

export const ManifestContentBinary = z.discriminatedUnion('type', [
  ...ContentExplicitBase64.options,
  ...ContentRelative.options
]);
export type ManifestContentBinary = z.infer<typeof ManifestContentBinary>;

export const ManifestContentString = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentRelative.options
]);
export type ManifestContentString = z.infer<typeof ManifestContentString>;

export const ContentAny = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentExplicitBase64.options,
  ...ContentExplicit.options,
  ...ContentRelative.options,
  ...ContentAbsoluteFile.options,
  ...ContentAbsoluteUrl.options
]);
export type ContentAny = z.infer<typeof ContentAny>;

export const ContentAnyLocal = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentExplicitBase64.options,
  ...ContentExplicit.options,
  ...ContentRelative.options,
  ...ContentAbsoluteFile.options
]);
export type ContentAnyLocal = z.infer<typeof ContentAnyLocal>;

export const ContentAnyRemote = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentExplicitBase64.options,
  ...ContentExplicit.options,
  ...ContentRelative.options,
  ...ContentAbsoluteUrl.options
]);
export type ContentAnyRemote = z.infer<typeof ContentAnyRemote>;

//
// Narrow types with relative option
//

export const ContentAnyBinaryRemote = z.discriminatedUnion('type', [
  ...ContentExplicitBase64.options,
  ...ContentExplicit.options,
  ...ContentRelative.options,
  ...ContentAbsoluteUrl.options
]);
export type ContentAnyBinaryRemote = z.infer<typeof ContentAnyBinaryRemote>;

export const ContentAnyBinaryLocal = z.discriminatedUnion('type', [
  ...ContentExplicitBase64.options,
  ...ContentExplicit.options,
  ...ContentRelative.options,
  ...ContentAbsoluteFile.options
]);
export type ContentAnyBinaryLocal = z.infer<typeof ContentAnyBinaryLocal>;

export const ContentAnyTextRemote = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentRelative.options,
  ...ContentAbsoluteUrl.options
]);
export type ContentAnyTextRemote = z.infer<typeof ContentAnyTextRemote>;

export const ContentAnyTextLocal = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentRelative.options,
  ...ContentAbsoluteFile.options
]);
export type ContentAnyTextLocal = z.infer<typeof ContentAnyTextLocal>;

//
// Narrow absolute types
//

export const ContentAbsoluteBinaryRemote = z.discriminatedUnion('type', [
  ...ContentExplicitBase64.options,
  ...ContentExplicit.options,
  ...ContentAbsoluteUrl.options
]);
export type ContentAbsoluteBinaryRemote = z.infer<typeof ContentAbsoluteBinaryRemote>;

export const ContentAbsoluteBinaryLocal = z.discriminatedUnion('type', [
  ...ContentExplicitBase64.options,
  ...ContentExplicit.options,
  ...ContentAbsoluteFile.options
]);
export type ContentAbsoluteBinaryLocal = z.infer<typeof ContentAbsoluteBinaryLocal>;

export const ContentAbsoluteTextRemote = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentAbsoluteUrl.options
]);
export type ContentAbsoluteTextRemote = z.infer<typeof ContentAbsoluteTextRemote>;

export const ContentAbsoluteTextLocal = z.discriminatedUnion('type', [
  ...ContentExplicitString.options,
  ...ContentAbsoluteFile.options
]);
export type ContentAbsoluteTextLocal = z.infer<typeof ContentAbsoluteTextLocal>;

export function ConstructContent(
  contentType: 'text',
  contextType: 'local'
): typeof ContentAnyTextLocal;
export function ConstructContent(
  contentType: 'text',
  contextType: 'remote'
): typeof ContentAnyTextRemote;
export function ConstructContent(
  contentType: 'binary',
  contextType: 'local'
): typeof ContentAnyBinaryLocal;
export function ConstructContent(
  contentType: 'binary',
  contextType: 'remote'
): typeof ContentAnyBinaryRemote;
export function ConstructContent(
  contentType: ContentType,
  contextType: ContextType
):
  | typeof ContentAnyTextLocal
  | typeof ContentAnyTextRemote
  | typeof ContentAnyBinaryLocal
  | typeof ContentAnyBinaryRemote;
export function ConstructContent(contentType: ContentType, contextType: ContextType) {
  return contentType === 'text'
    ? contextType === 'local'
      ? ContentAnyTextLocal
      : ContentAnyTextRemote
    : contextType === 'local'
      ? ContentAnyBinaryLocal
      : ContentAnyBinaryRemote;
}

export const DescriptionContentBinary = z
  .string()
  .transform<ManifestContentBinary>((value, ctx) => {
    if (value.startsWith('file:')) return { type: 'relative', path: value.slice(5) };
    else return { type: 'explicit-base64', content: value };
  });
export type DescriptionContentBinary = z.infer<typeof DescriptionContentBinary>;

export const DescriptionContentStirng = z
  .string()
  .transform<ManifestContentString>((value, ctx) => {
    if (value.startsWith('file:')) return { type: 'relative', path: value.slice(5) };
    else return { type: 'explicit-string', content: value };
  });
export type DescriptionContentStirng = z.infer<typeof DescriptionContentStirng>;
