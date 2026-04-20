import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as blockTools from '@platforma-sdk/block-tools';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadBlockDescription() {
  return await blockTools.loadPackDescriptionFromSource(__dirname);
}

export const blockSpec = {
  type: 'dev-v2',
  folder: __dirname,
};
