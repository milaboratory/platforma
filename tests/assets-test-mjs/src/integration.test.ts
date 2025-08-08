import { describe, it, expect } from 'vitest';
import { testAssets } from '@milaboratories/test-assets';
import * as path from 'path';
import * as fs from 'fs';

describe('npm-asset-packer ESM integration', () => {
  it('should provide correctly typed asset access', () => {
    // Test that the asset objects exist and have the correct properties
    expect(testAssets['test-file.txt']).toBeDefined();
    expect(testAssets['data/sample.json']).toBeDefined();
    
    // Test the interface properties
    const textAsset = testAssets['test-file.txt'];
    expect(textAsset.sha256).toBe('5b986cc78579bfd0de00f4b4145715c475381c80d7e7251b3c3c6af585d98ab9');
    expect(textAsset.size).toBe(41);
    expect(textAsset.downloadUrl).toBeUndefined(); // npm mode doesn't have downloadUrl
    
    const jsonAsset = testAssets['data/sample.json'];
    expect(jsonAsset.sha256).toBe('ba490d2004efc38d991df0dab443b74b31fffc027569f205a669a8758d73419e');
    expect(jsonAsset.size).toBe(31);
    expect(jsonAsset.downloadUrl).toBeUndefined();
  });

  it('should resolve linked assets (Local-First Resolution)', async () => {
    // This test simulates the monorepo development scenario where packages are linked
    const textAsset = testAssets['test-file.txt'];
    const resolvedPath = await textAsset.path();
    
    // Should resolve to the original source file in the assets directory
    expect(resolvedPath).toContain('assets/test-file.txt');
    expect(fs.existsSync(resolvedPath)).toBe(true);
    
    // Verify the file content matches
    const content = fs.readFileSync(resolvedPath, 'utf8');
    expect(content).toBe('This is a test file for npm-asset-packer\n');
  });

  it('should resolve bundled assets when linked assets are ignored', async () => {
    // This test simulates the published package scenario
    const textAsset = testAssets['test-file.txt'];
    const resolvedPath = await textAsset.path({ ignoreLinkedAssets: true });
    
    // Should resolve to the bundled file with SHA256 name
    expect(resolvedPath).toContain('dist/assets/' + textAsset.sha256);
    expect(fs.existsSync(resolvedPath)).toBe(true);
    
    // Verify the file content matches
    const content = fs.readFileSync(resolvedPath, 'utf8');
    expect(content).toBe('This is a test file for npm-asset-packer\n');
  });

  it('should resolve JSON asset correctly', async () => {
    const jsonAsset = testAssets['data/sample.json'];
    const resolvedPath = await jsonAsset.path();
    
    expect(fs.existsSync(resolvedPath)).toBe(true);
    
    // Verify the JSON content
    const content = fs.readFileSync(resolvedPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed).toEqual({ test: 'data', number: 42 });
  });

  it('should handle relative paths correctly', async () => {
    const jsonAsset = testAssets['data/sample.json'];
    const resolvedPath = await jsonAsset.path();
    
    // The resolved path should be absolute
    expect(path.isAbsolute(resolvedPath)).toBe(true);
  });
});