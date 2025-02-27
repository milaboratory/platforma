import { z } from 'zod';

export const LocalDevFolder = z.object({
  type: z.literal('local-dev'),
  path: z.string()
});
export type LocalDevFolder = z.infer<typeof LocalDevFolder>;

/** @deprecated don't use */
export const RemoteRegistryV1Spec = z.object({
  type: z.literal('remote-v1'),
  url: z.string().url()
});
/** @deprecated don't use */
export type RemoteRegistryV1Spec = z.infer<typeof RemoteRegistryV1Spec>;

export const RemoteRegistryV2Spec = z.object({
  type: z.literal('remote-v2'),
  url: z.string().url()
});
export type RemoteRegistryV2Spec = z.infer<typeof RemoteRegistryV2Spec>;

export const RegistrySpec = z.discriminatedUnion('type', [
  RemoteRegistryV1Spec,
  RemoteRegistryV2Spec,
  LocalDevFolder
]);
export type RegistrySpec = z.infer<typeof RegistrySpec>;

export const RegistryEntry = z.object({
  id: z.string(),
  title: z.string().optional(),
  spec: RegistrySpec
});
export type RegistryEntry = z.infer<typeof RegistryEntry>;

export const RegistryList = z.array(RegistryEntry);
export type RegistryList = z.infer<typeof RegistryList>;
