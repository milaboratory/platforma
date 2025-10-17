import { test, expect } from 'vitest';
import * as builder from './builder';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as util from '../util';

const skipCI = process.env.CI === 'true';

test('download latest', async (): Promise<void> => {
  const logger = util.createLogger();
  if (skipCI) {
    logger.info('Skipping test (not for CI)');
    return;
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-conda-builder'));
  logger.info('test directory: ' + tempDir);

  await builder.downloadMicromamba(logger, {
    platform: util.currentPlatform(),
    outputPath: path.join(tempDir, 'micromamba'),
  });

  await fsp.rm(tempDir, { recursive: true });
});

test('cli wrapper full cycle', { timeout: 90_000 }, async (): Promise<void> => {
  const logger = util.createLogger();
  if (skipCI) {
    logger.info('Skipping test (not for CI)');
    return;
  }

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'test-conda-builder'));
  logger.info('test directory: ' + tempDir);

  const tool = new builder.micromamba(logger, tempDir);
  await tool.downloadBinary();

  const version = tool.getVersion();
  expect(version.trim()).not.toEqual('');

  const envSpecPath = path.join(tempDir, 'env.yaml');

  await fsp.writeFile(envSpecPath, `
name: my-env
channels:
  - defaults
dependencies:
  - python=3.10
`);

  const envPrefix = path.join(tempDir, 'my-env');
  tool.createEnvironment({ environmentPrefix: envPrefix, specFile: envSpecPath });

  const exportSpecPath = path.join(tempDir, 'exported-env.yaml');
  tool.exportEnvironment({ environmentPrefix: envPrefix, outputFile: exportSpecPath });

  const exportedEnv = await fsp.readFile(exportSpecPath, 'utf-8');
  expect(exportedEnv).toContain('python');
  expect(exportedEnv).toContain('channels:');
  expect(exportedEnv).toContain('dependencies:');

  tool.deleteEnvironment({ environmentPrefix: envPrefix });

  await fsp.rm(tempDir, { recursive: true });
});
