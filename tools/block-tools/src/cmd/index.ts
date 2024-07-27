import BuildModel from './build-model';
import PackBlock from './pack-block';
import UploadPackageV1 from './upload-package-v1';

// prettier-ignore
export const COMMANDS = {
  'upload-package-v1': UploadPackageV1,
  'pack': PackBlock,
  'build-model': BuildModel,
};
