import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Verify, that:
// - dist/tengo/asset has 1.2.3.as.json
// - this file has: https://example.com/base-path/ string, 1.2.3 string

const baseDir = './dist/tengo/asset';
const fileName = '1.2.3.as.json';

function verifyFileExists(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }
  console.log(`✓ File exists: ${filePath}`);
}

function verifyValidJSON(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    console.log(`✓ Valid JSON: ${filePath}`);
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

function verifyAssetContent(data) {
  const { asset } = data;

  if (!asset) {
    throw new Error('Expected asset property in JSON data');
  }

  if (!asset.url) {
    throw new Error('Expected url property in asset');
  }

  if (!asset.url.includes('https://example.com/base-path/')) {
    throw new Error(`Expected url to contain 'https://example.com/base-path/', got '${asset.url}'`);
  }

  if (!asset.url.includes('1.2.3')) {
    throw new Error(`Expected url to contain '1.2.3', got '${asset.url}'`);
  }

  console.log('✓ Asset content verification passed');
  console.log(`  - URL contains base path: ${asset.url.includes('https://example.com/base-path/')}`);
  console.log(`  - URL contains version: ${asset.url.includes('1.2.3')}`);
  console.log(`  - Full URL: ${asset.url}`);
}

function main() {
  try {
    console.log('Starting asset verification...');

    const asset123Path = join(baseDir, fileName);
    verifyFileExists(asset123Path);
    const asset123Data = verifyValidJSON(asset123Path);
    verifyAssetContent(asset123Data);

    console.log('✅ All asset are valid.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Asset verification failed:', error.message);
    process.exit(1);
  }
}

main();
