import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { prepareDockerOptions } from '../docker-conda';
import type * as artifacts from '../schemas/artifacts';
import type winston from 'winston';

import * as defaults from '../../defaults';

// Mock the os module
vi.mock('node:os', () => ({
  platform: vi.fn(),
  tmpdir: vi.fn(),
}));

// Mock winston logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as winston.Logger;

// Mock Python package for testing - will be set in beforeEach
let mockCondaPackage: artifacts.condaType;

describe('Docker Conda Functions', () => {
  let tempDir: string;
  let testPackageRoot: string;

  beforeEach(() => {
    // Set up OS mocks
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');

    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join('/tmp', 'python-docker-test'));
    testPackageRoot = path.join(tempDir, 'package');

    fs.mkdirSync(testPackageRoot, { recursive: true });

    // Create src directory for the root property
    fs.mkdirSync(path.join(testPackageRoot, 'src'), { recursive: true });

    // Create a mock spec file
    fs.writeFileSync(path.join(testPackageRoot, 'some-spec.yaml'), `
name: my-env
channels: []
dependencies: []
`);

    // Initialize mockPythonPackage with absolute path
    mockCondaPackage = {
      'type': 'conda',
      'name': 'test-conda-package',
      'version': '1.0.0',
      'registry': { name: 'test' },
      'roots': {
        'linux-x64': path.join(testPackageRoot, 'src'), // Use absolute path
      },
      'docker-registry': 'test-docker-registry',

      'micromamba-version': 'some-micromamba-version',
      'conda-root-dir': 'some-conda-root-dir',
      'spec': 'some-spec.yaml',
      'pkg': '/app',
    };

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up temporary directories
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('prepareDockerOptions', () => {
    it('should create dist/docker directories recursively', () => {
      // Verify directories don't exist initially
      expect(fs.existsSync(path.join(testPackageRoot, 'dist'))).toBe(false);

      const result = prepareDockerOptions(mockLogger, testPackageRoot, 'artifact-id', mockCondaPackage);

      // Verify directories were created
      expect(fs.existsSync(path.join(testPackageRoot, 'dist', 'docker'))).toBe(true);

      // Verify result structure
      expect(result).toMatchObject({
        context: expect.stringContaining(testPackageRoot) as string,
        dockerfile: expect.stringContaining('Dockerfile') as string,
        entrypoint: [],
      });

      // Verify Dockerfile was created
      expect(fs.existsSync(result.dockerfile)).toBe(true);
      expect(fs.existsSync(result.context)).toBe(true);
    });

    it('should generate Dockerfile with correct content', () => {
      const result = prepareDockerOptions(mockLogger, testPackageRoot, 'artifact-id', mockCondaPackage);

      expect(result).toMatchObject({
        context: expect.stringContaining(testPackageRoot) as string,
        dockerfile: expect.stringContaining('Dockerfile') as string,
        entrypoint: [],
      });

      // Verify Dockerfile was created
      expect(fs.existsSync(result.dockerfile)).toBe(true);
      expect(fs.existsSync(result.context)).toBe(true);

      const dockerfileContent = fs.readFileSync(result.dockerfile, 'utf-8');

      // Check essential Dockerfile components
      expect(dockerfileContent).toContain(`FROM ${defaults.CONDA_DOCKER_BASE_IMAGE}`);
      expect(dockerfileContent).toContain('COPY . /app');
      expect(dockerfileContent).toContain('RUN micromamba');
      expect(dockerfileContent).toContain(defaults.CONDA_FROEZEN_ENV_SPEC_FILE);
      expect(dockerfileContent).toContain(defaults.CONDA_DATA_LOCATION);
    });
  });
});
