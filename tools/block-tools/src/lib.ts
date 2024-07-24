import * as RepoSchemaV1 from './registry_v1/v1_repo_schema';
import * as ConfigSchemaV1 from './registry_v1/config_schema';
import { PlRegPackageConfig } from './registry_v1/config';

export const V1 = {
  ...RepoSchemaV1,
  ...ConfigSchemaV1,
  PlRegPackageConfig
};
