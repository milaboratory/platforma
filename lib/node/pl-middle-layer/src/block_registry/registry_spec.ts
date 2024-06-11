export type RemoteRegistryV1Spec = {
  type: 'remote_v1',
  label: string,
  url: string
}

export type FolderWithDevPackagesRegistrySpec = {
  type: 'folder_with_dev_packages',
  label: string,
  path: string
}

export type RegistrySpec = RemoteRegistryV1Spec | FolderWithDevPackagesRegistrySpec;
