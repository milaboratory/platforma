import { Command, Flags } from '@oclif/core';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as crypto from 'crypto';
import { z } from 'zod';

// Schema for the assetPacker configuration in package.json
const AssetPackerConfigSchema = z.object({
  mode: z.enum(['remote', 'npm']),
  bucket: z.string().optional(),
  region: z.string().optional(),
  prefix: z.string().optional(),
  downloadUrl: z.string().optional(),
}).refine((data) => {
  if (data.mode === 'remote') {
    return !!data.bucket && !!data.region && !!data.downloadUrl;
  }
  return true;
}, {
  message: "For remote mode, bucket, region, and downloadUrl are required",
});

type AssetPackerConfig = z.infer<typeof AssetPackerConfigSchema>;

interface AssetManifestEntry {
  sha256: string;
  size: number;
  sourcePath: string;
}

type AssetManifest = Record<string, AssetManifestEntry>;

export default class BuildCommand extends Command {
  static override description = 'Scan assets directory and generate manifest and runtime code';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static override flags = {
    help: Flags.help({ char: 'h' }),
    cwd: Flags.string({
      char: 'c',
      description: 'Working directory (defaults to current directory)',
      default: process.cwd(),
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(BuildCommand);

    try {
      // Read package.json to get configuration
      const packageJsonPath = path.join(flags.cwd, 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        this.error('package.json not found in the specified directory');
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const config = this.validateConfig(packageJson);

      // Check if assets directory exists
      const assetsDir = path.join(flags.cwd, 'assets');
      if (!await fs.pathExists(assetsDir)) {
        this.warn('assets directory not found, creating empty manifest');
        await this.generateEmptyManifest(flags.cwd, config, packageJson.name);
        return;
      }

      // Scan assets directory
      this.log('Scanning assets directory...');
      const manifest = await this.scanAssetsDirectory(assetsDir, flags.cwd);

      // Generate manifest file
      const distDir = path.join(flags.cwd, 'dist');
      await fs.ensureDir(distDir);
      
      const manifestPath = path.join(distDir, 'manifest.json');
      await fs.writeJson(manifestPath, manifest, { spaces: 2 });
      this.log(`Generated manifest: ${manifestPath}`);

      // Handle npm mode - create hard links
      if (config.mode === 'npm') {
        await this.createHardLinks(manifest, distDir);
      }

      // Generate runtime code
      await this.generateRuntimeCode(distDir, manifest, config, packageJson.name);

      this.log('Build completed successfully!');
    } catch (error) {
      this.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private validateConfig(packageJson: any): AssetPackerConfig {
    if (!packageJson.assetPacker) {
      this.error('assetPacker configuration not found in package.json');
    }

    try {
      return AssetPackerConfigSchema.parse(packageJson.assetPacker);
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.error(`Invalid assetPacker configuration: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  private async scanAssetsDirectory(assetsDir: string, baseDir: string): Promise<AssetManifest> {
    const manifest: AssetManifest = {};
    
    const scanDirectory = async (dir: string, relativePath: string = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativeFilePath = path.join(relativePath, entry.name).replace(/\\/g, '/');
        
        if (entry.isDirectory()) {
          await scanDirectory(fullPath, relativeFilePath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          const hash = await this.calculateSHA256(fullPath);
          
          manifest[relativeFilePath] = {
            sha256: hash,
            size: stats.size,
            sourcePath: path.relative(baseDir, fullPath).replace(/\\/g, '/'),
          };
        }
      }
    };

    await scanDirectory(assetsDir);
    return manifest;
  }

  private async calculateSHA256(filePath: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    return new Promise((resolve, reject) => {
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async createHardLinks(manifest: AssetManifest, distDir: string): Promise<void> {
    const assetsDistDir = path.join(distDir, 'assets');
    await fs.ensureDir(assetsDistDir);

    for (const entry of Object.values(manifest)) {
      const sourcePath = entry.sourcePath;
      const targetPath = path.join(assetsDistDir, entry.sha256);
      
      try {
        // Remove existing link if it exists
        if (await fs.pathExists(targetPath)) {
          await fs.unlink(targetPath);
        }
        
        // Create hard link
        await fs.link(sourcePath, targetPath);
      } catch (error) {
        this.warn(`Failed to create hard link for ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async generateEmptyManifest(baseDir: string, config: AssetPackerConfig, packageName: string): Promise<void> {
    const distDir = path.join(baseDir, 'dist');
    await fs.ensureDir(distDir);
    
    const manifestPath = path.join(distDir, 'manifest.json');
    await fs.writeJson(manifestPath, {}, { spaces: 2 });
    
    await this.generateRuntimeCode(distDir, {}, config, packageName);
  }

  private async generateRuntimeCode(distDir: string, manifest: AssetManifest, config: AssetPackerConfig, packageName: string): Promise<void> {
    // Generate TypeScript definitions
    await this.generateTypeDefinitions(distDir, manifest, packageName);
    
    // Generate CommonJS runtime
    await this.generateCommonJSRuntime(distDir, manifest, config, packageName);
    
    // Generate ESM runtime
    await this.generateESMRuntime(distDir, manifest, config, packageName);
  }

  private async generateTypeDefinitions(distDir: string, manifest: AssetManifest, packageName: string): Promise<void> {
    const constantName = this.packageNameToConstantName(packageName);
    const assetKeys = Object.keys(manifest);
    
    const keysType = assetKeys.length > 0 
      ? assetKeys.map(key => `"${key}"`).join(' | ')
      : 'never';

    const content = `// Generated by @milaboratories/npm-asset-packer

export interface AssetFile {
  /** The SHA256 hash of the file content. */
  readonly sha256: string;
  /** The size of the file in bytes. */
  readonly size: number;
  /** The public URL for downloading the file. Undefined in 'npm' mode. */
  readonly downloadUrl?: string;
  /**
   * Resolves the local path to the asset.
   * Triggers a download if the file is not available locally.
   * Returns a promise that resolves to the absolute path of the file on the local filesystem.
   * @param opts - Optional parameters for resolution.
   * @param opts.ignoreLinkedAssets - If true, bypasses the linked asset check (Local-First Resolution) and proceeds to other resolution methods. Useful for testing the npm mode in a monorepo.
   */
  path(opts?: { ignoreLinkedAssets?: boolean }): Promise<string>;
}

type AssetKeys = ${keysType};
export const ${constantName}: Record<AssetKeys, AssetFile>;
`;

    const filePath = path.join(distDir, 'index.d.ts');
    await fs.writeFile(filePath, content);
  }

  private async generateCommonJSRuntime(distDir: string, manifest: AssetManifest, config: AssetPackerConfig, packageName: string): Promise<void> {
    const constantName = this.packageNameToConstantName(packageName);
    
    const content = this.generateRuntimeImplementation(manifest, config, constantName, 'cjs');
    const filePath = path.join(distDir, 'index.js');
    await fs.writeFile(filePath, content);
  }

  private async generateESMRuntime(distDir: string, manifest: AssetManifest, config: AssetPackerConfig, packageName: string): Promise<void> {
    const constantName = this.packageNameToConstantName(packageName);
    
    const content = this.generateRuntimeImplementation(manifest, config, constantName, 'esm');
    const filePath = path.join(distDir, 'index.mjs');
    await fs.writeFile(filePath, content);
  }

  private generateRuntimeImplementation(manifest: AssetManifest, config: AssetPackerConfig, constantName: string, moduleType: 'cjs' | 'esm'): string {
    const manifestJson = JSON.stringify(manifest, null, 2);
    const configJson = JSON.stringify(config, null, 2);

    const imports = moduleType === 'esm' 
      ? `import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import * as https from 'https';`
      : `const fs = require('fs');
const path = require('path');
const os = require('os');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const https = require('https');`;

    const exportStatement = moduleType === 'esm' 
      ? `export const ${constantName} = assets;`
      : `module.exports = { ${constantName}: assets };`;

    return `// Generated by @milaboratories/npm-asset-packer
${imports}

const pipelineAsync = promisify(pipeline);

const manifest = ${manifestJson};
const config = ${configJson};

class AssetFileImpl {
  constructor(relativePath, entry) {
    this.relativePath = relativePath;
    this.sha256 = entry.sha256;
    this.size = entry.size;
    this.downloadUrl = config.mode === 'remote' ? \`\${config.downloadUrl}/\${entry.sha256}\` : undefined;
  }

  async path(opts = {}) {
    // 1. Local-First Resolution (Linked Packages)
    if (!opts.ignoreLinkedAssets) {
      try {
        const linkedPath = path.resolve(__dirname, '..', 'assets', this.relativePath);
        if (fs.existsSync(linkedPath)) {
          return linkedPath;
        }
      } catch (error) {
        // Ignore and continue to next resolution method
      }
    }

    // 2. Packaged Asset Check (Eager/NPM Mode)
    const packagedPath = path.resolve(__dirname, 'assets', this.sha256);
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }

    // 3. Global Cache Check (Lazy Mode)
    const cacheDir = path.join(os.homedir(), '.cache', 'mi-asset-packer');
    const cachedPath = path.join(cacheDir, this.sha256);
    if (fs.existsSync(cachedPath)) {
      return cachedPath;
    }

    // 4. Download (Lazy Mode)
    if (config.mode === 'remote' && this.downloadUrl) {
      await this.ensureDir(cacheDir);
      await this.downloadFile(this.downloadUrl, cachedPath);
      return cachedPath;
    }

    throw new Error(\`Asset not found: \${this.relativePath}\`);
  }

  async ensureDir(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async downloadFile(url, targetPath) {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(\`Failed to download \${url}: \${response.statusCode}\`));
          return;
        }

        const fileStream = createWriteStream(targetPath);
        pipelineAsync(response, fileStream)
          .then(() => resolve())
          .catch(reject);
      });

      request.on('error', reject);
    });
  }
}

// Create asset objects
const assets = {};
for (const [relativePath, entry] of Object.entries(manifest)) {
  assets[relativePath] = new AssetFileImpl(relativePath, entry);
}

${exportStatement}
`;
  }

  private packageNameToConstantName(packageName: string): string {
    // Convert package name like "@scope/my-package" to "myPackage"
    return packageName
      .replace(/^@[^/]+\//, '') // Remove scope
      .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
      .replace(/\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // Title case each word
      .replace(/\s+/g, '') // Remove spaces
      .replace(/^\w/, (c) => c.toLowerCase()); // Make first character lowercase
  }
}