import { BlockPackDescriptionAbsolute } from '@platforma-sdk/block-tools';

declare function loadBlockDescription(): BlockPackDescriptionAbsolute;
declare const blockSpec: {
  type: 'dev-v2';
  folder: string;
};

export { loadBlockDescription, blockSpec };
