import { Command, Flags } from '@oclif/core';
import * as fs from 'fs-extra';
import * as path from 'path';
import { S3Client, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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

export default class UploadCommand extends Command {
  static override description = 'Upload assets to S3 storage';

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
      description: 'Force upload even if object already exists in S3',
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(UploadCommand);

    try {
      // Read package.json to get configuration
      const packageJsonPath = path.join(flags.cwd, 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        this.error('package.json not found in the specified directory');
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const config = this.validateConfig(packageJson);

      if (config.mode !== 'remote') {
        this.log('Upload is only available for remote mode, skipping...');
        return;
      }

      // Read manifest
      const manifestPath = path.join(flags.cwd, 'dist', 'manifest.json');
      if (!await fs.pathExists(manifestPath)) {
        this.error('Manifest file not found. Please run "build" command first.');
      }

      const manifest: AssetManifest = await fs.readJson(manifestPath);
      
      if (Object.keys(manifest).length === 0) {
        this.log('No assets to upload.');
        return;
      }

      // Initialize S3 client
      const s3Client = new S3Client({ 
        region: config.region,
      });

      // Upload assets
      await this.uploadAssets(s3Client, manifest, config, flags.cwd, flags.force);

      this.log('Upload completed successfully!');
    } catch (error) {
      this.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
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

  private async uploadAssets(
    s3Client: S3Client, 
    manifest: AssetManifest, 
    config: AssetPackerConfig, 
    baseDir: string,
    force: boolean
  ): Promise<void> {
    const entries = Object.entries(manifest);
    let uploadCount = 0;
    let skipCount = 0;

    this.log(`Starting upload of ${entries.length} assets...`);

    for (const [relativePath, entry] of entries) {
      const s3Key = config.prefix ? `${config.prefix}/${entry.sha256}` : entry.sha256;
      
      try {
        // Check if object already exists in S3
        if (!force) {
          const exists = await this.checkS3ObjectExists(s3Client, config.bucket!, s3Key);
          if (exists) {
            this.log(`✓ ${relativePath} (${entry.sha256}) - already exists, skipping`);
            skipCount++;
            continue;
          }
        }

        // Upload the file
        const sourcePath = path.resolve(baseDir, entry.sourcePath);
        await this.uploadFile(s3Client, config.bucket!, s3Key, sourcePath);
        
        this.log(`✓ ${relativePath} (${entry.sha256}) - uploaded`);
        uploadCount++;
      } catch (error) {
        this.warn(`Failed to upload ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    this.log(`Upload summary: ${uploadCount} uploaded, ${skipCount} skipped`);
  }

  private async checkS3ObjectExists(s3Client: S3Client, bucket: string, key: string): Promise<boolean> {
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  private async uploadFile(s3Client: S3Client, bucket: string, key: string, filePath: string): Promise<void> {
    const fileStream = fs.createReadStream(filePath);
    const stats = await fs.stat(filePath);

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentLength: stats.size,
    }));
  }
}