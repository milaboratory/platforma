import { Command, Flags } from '@oclif/core';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { z } from 'zod';

const pipelineAsync = promisify(pipeline);

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

export default class PrepareCommand extends Command {
  static override description = 'Download assets for eager loading (used in prepare npm script)';

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
    force: Flags.boolean({
      char: 'f',
      description: 'Force download even if asset already exists locally',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PrepareCommand);

    try {
      // Read package.json to get configuration
      const packageJsonPath = path.join(flags.cwd, 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        this.error('package.json not found in the specified directory');
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const config = this.validateConfig(packageJson);

      if (config.mode !== 'remote') {
        this.log('Prepare is only relevant for remote mode, skipping...');
        return;
      }

      // Read manifest
      const manifestPath = path.join(flags.cwd, 'dist', 'manifest.json');
      if (!await fs.pathExists(manifestPath)) {
        this.error('Manifest file not found. This command should run in published packages.');
      }

      const manifest: AssetManifest = await fs.readJson(manifestPath);
      
      if (Object.keys(manifest).length === 0) {
        this.log('No assets to download.');
        return;
      }

      // Download assets
      await this.downloadAssets(manifest, config, flags.cwd, flags.force);

      this.log('Prepare completed successfully!');
    } catch (error) {
      this.error(`Prepare failed: ${error instanceof Error ? error.message : String(error)}`);
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

  private async downloadAssets(
    manifest: AssetManifest, 
    config: AssetPackerConfig, 
    baseDir: string,
    force: boolean
  ): Promise<void> {
    const entries = Object.entries(manifest);
    let downloadCount = 0;
    let skipCount = 0;

    this.log(`Starting download of ${entries.length} assets...`);

    // Ensure dist/assets directory exists
    const assetsDir = path.join(baseDir, 'dist', 'assets');
    await fs.ensureDir(assetsDir);

    for (const [relativePath, entry] of entries) {
      const targetPath = path.join(assetsDir, entry.sha256);
      
      try {
        // Check if file already exists
        if (!force && await fs.pathExists(targetPath)) {
          this.log(`✓ ${relativePath} (${entry.sha256}) - already exists, skipping`);
          skipCount++;
          continue;
        }

        // Download the file
        const downloadUrl = `${config.downloadUrl}/${entry.sha256}`;
        await this.downloadFile(downloadUrl, targetPath);
        
        this.log(`✓ ${relativePath} (${entry.sha256}) - downloaded`);
        downloadCount++;
      } catch (error) {
        this.warn(`Failed to download ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.log(`Download summary: ${downloadCount} downloaded, ${skipCount} skipped`);
  }

  private async downloadFile(url: string, targetPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
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