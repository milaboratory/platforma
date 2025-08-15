import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

// Mock the os module
vi.mock('node:os', () => ({
  platform: vi.fn(),
  tmpdir: vi.fn(),
}));

// Mock the child_process module
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));
import {
  generatePythonDockerfile,
  buildPythonDockerImage,
  getPythonVersionFromEnvironment,
  type PythonDockerOptions,
} from '../python-docker';
import type { PythonPackage } from '../package-info';
import type winston from 'winston';

// Mock the pkg.assets function to return real file paths
vi.mock('../package', () => ({
  assets: (file: string) => {
    if (file === 'python-dockerfile.template') {
      return path.join(__dirname, '../../../assets/python-dockerfile.template');
    }
    return `/tmp/mock-assets/${file}`;
  },
}));

// Mock winston logger - simplified
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as winston.Logger;

// Mock Python package for testing - simplified
const mockPythonPackage: PythonPackage = {
  name: 'test-python-package',
  version: '1.0.0',
  type: 'python',
  environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
  registry: { name: 'test' },
  root: './src',
  contentRoot: () => './src',
  crossplatform: false,
  isMultiroot: false,
  fullName: () => 'test-python-package-1.0.0',
  namePattern: 'test-python-package-1.0.0-{os}-{arch}',
  dependencies: {
    toolset: 'pip',
    requirementsFile: 'requirements.txt',
  },
};

// Helper function to create properly typed mock spawnSync return values
const createMockSpawnSyncReturn = (overrides: Partial<SpawnSyncReturns<string | Buffer>> = {}): SpawnSyncReturns<string | Buffer> => ({
  error: undefined,
  status: 0,
  signal: null,
  pid: 123,
  stdout: Buffer.from(''),
  stderr: Buffer.from(''),
  output: [Buffer.from(''), Buffer.from('')],
  ...overrides,
});

describe('Python Docker Functions', () => {
  let tempDir: string;
  let testPackageRoot: string;

  beforeEach(() => {
    // Set up OS mocks
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');

    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join('/tmp', 'python-docker-test-'));
    testPackageRoot = path.join(tempDir, 'package');

    fs.mkdirSync(testPackageRoot, { recursive: true });

    // Create a mock requirements.txt file
    fs.writeFileSync(path.join(testPackageRoot, 'requirements.txt'), 'requests>=2.25.0\n');
  });

  afterEach(() => {
    // Clean up temporary directories
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generatePythonDockerfile', () => {
    it('should generate Dockerfile with default options', () => {
      const dockerfile = generatePythonDockerfile(testPackageRoot, mockPythonPackage);

      // Check essential Dockerfile components
      expect(dockerfile).toMatch(/FROM python:3\.12\.6-slim/);
      expect(dockerfile).toContain('WORKDIR /app');
      expect(dockerfile).toContain('COPY . /app/');
      expect(dockerfile).toContain('RUN pip install --no-cache-dir -r requirements.txt');
      expect(dockerfile).toContain('ENV PYTHONPATH=/app');
      expect(dockerfile).toContain('CMD ["python", "--version"]');
    });

    it('should generate Dockerfile with custom options', () => {
      const customRequirementsFile = 'custom-requirements.txt';
      fs.writeFileSync(path.join(testPackageRoot, customRequirementsFile), 'numpy>=1.20.0\n');

      const options: PythonDockerOptions = {
        pythonVersion: '3.11.0',
        requirementsFile: customRequirementsFile,
        toolset: 'pip',
      };

      const dockerfile = generatePythonDockerfile(testPackageRoot, mockPythonPackage, options);

      // Check custom options are reflected
      expect(dockerfile).toMatch(/FROM python:3\.11\.0-slim/);
      expect(dockerfile).toContain(`COPY ${customRequirementsFile} /app/`);
      expect(dockerfile).toContain(`RUN pip install --no-cache-dir -r ${customRequirementsFile}`);
    });

    it('should handle package without version (uses latest)', () => {
      const packageWithoutVersion: PythonPackage = {
        ...mockPythonPackage,
        version: undefined,
      };

      const dockerfile = generatePythonDockerfile(testPackageRoot, packageWithoutVersion);

      // Should use 'latest' tag
      expect(dockerfile).toMatch(/FROM python:latest-slim/);
    });

    it('should handle custom toolset (conda)', () => {
      const options: PythonDockerOptions = {
        pythonVersion: '3.12.6',
        toolset: 'conda',
        requirementsFile: 'environment.yml',
      };

      const dockerfile = generatePythonDockerfile(testPackageRoot, mockPythonPackage, options);

      // Should use conda commands
      expect(dockerfile).toContain('COPY environment.yml /app/');
      expect(dockerfile).toContain('RUN conda env update -f environment.yml');
    });
  });

  describe('getPythonVersionFromEnvironment', () => {
    it('should extract Python version from environment string', () => {
      const version = getPythonVersionFromEnvironment('@platforma-open/milaboratories.runenv-python-3:3.12.6');
      expect(version).toBe('3.12.6');
    });

    it('should handle environment without version', () => {
      const version = getPythonVersionFromEnvironment('@platforma-open/milaboratories.runenv-python-3');
      expect(version).toBeUndefined();
    });

    it('should handle malformed environment string', () => {
      const version = getPythonVersionFromEnvironment('invalid-environment-string');
      expect(version).toBeUndefined();
    });
  });

  describe('buildPythonDockerImage', () => {
    const mockSpawnSync = vi.mocked(spawnSync);

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should handle platform-specific behavior', () => {
      // Mock successful spawnSync result for this test
      mockSpawnSync.mockReturnValue(createMockSpawnSyncReturn());

      const result = buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);

      if (os.platform() === 'linux') {
        // On Linux, function should not throw and may return a value
        expect(() => {
          buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);
        }).not.toThrow();
      } else {
        // On non-Linux, should return null
        expect(result).toBeNull();
      }
    });

    it('should return null on non-Linux platforms', () => {
      // Mock os.platform to return 'darwin' for this test
      vi.mocked(os.platform).mockReturnValue('darwin');

      const result = buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);

      expect(result).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('Skipping Docker build on non-Linux platform');
    });

    it('should call spawnSync with correct Docker build arguments on Linux', () => {
      // Mock successful spawnSync result
      mockSpawnSync.mockReturnValue(createMockSpawnSyncReturn());

      const result = buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);

      // Verify spawnSync was called with the expected arguments
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['build', '-t', 'pl-pkg-python-test-python-package:1.0.0', testPackageRoot, '-f', expect.stringContaining('Dockerfile')],
        {
          stdio: 'inherit',
          cwd: testPackageRoot,
        },
      );

      // Verify the result contains expected information
      expect(result).toEqual({
        tag: 'pl-pkg-python-test-python-package:1.0.0',
        packageName: 'test-python-package',
        packageVersion: '1.0.0',
        pythonVersion: '3.12.6',
        requirementsFile: 'requirements.txt',
        toolset: 'pip',
      });
    });

    it('should handle Docker build failure gracefully', () => {
      // Mock failed spawnSync result
      mockSpawnSync.mockReturnValue(createMockSpawnSyncReturn({ status: 1, stderr: Buffer.from('Docker build failed') }));

      // Should throw an error when Docker build fails
      expect(() => {
        buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);
      }).toThrow('Docker build failed with status 1');
    });

    it('should handle spawnSync error gracefully', () => {
      // Mock spawnSync error
      const mockError = new Error('Docker command not found');
      mockSpawnSync.mockReturnValue(createMockSpawnSyncReturn({
        error: mockError,
        status: null,
        signal: null,
        pid: null,
        stdout: null,
        stderr: null,
      }));

      // Should throw the spawnSync error
      expect(() => {
        buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);
      }).toThrow('Docker command not found');
    });

    it('should use custom Python version and toolset when provided', () => {
      // Mock successful spawnSync result
      mockSpawnSync.mockReturnValue(createMockSpawnSyncReturn());

      const customOptions: PythonDockerOptions = {
        pythonVersion: '3.11.0',
        toolset: 'conda',
        requirementsFile: 'environment.yml',
      };

      const result = buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage, customOptions);

      // Verify spawnSync was called with the expected arguments
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['build', '-t', 'pl-pkg-python-test-python-package:1.0.0', testPackageRoot, '-f', expect.stringContaining('Dockerfile')],
        {
          stdio: 'inherit',
          cwd: testPackageRoot,
        },
      );

      // Verify the result contains the custom options
      expect(result).toEqual({
        tag: 'pl-pkg-python-test-python-package:1.0.0',
        packageName: 'test-python-package',
        packageVersion: '1.0.0',
        pythonVersion: '3.11.0',
        requirementsFile: 'environment.yml',
        toolset: 'conda',
      });
    });

    it('should handle package without version (uses latest)', () => {
      // Mock successful spawnSync result
      mockSpawnSync.mockReturnValue(createMockSpawnSyncReturn());

      const packageWithoutVersion: PythonPackage = {
        ...mockPythonPackage,
        version: undefined,
      };

      const result = buildPythonDockerImage(mockLogger, testPackageRoot, packageWithoutVersion);

      // Verify spawnSync was called with 'latest' tag
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'docker',
        ['build', '-t', 'pl-pkg-python-test-python-package:latest', testPackageRoot, '-f', expect.stringContaining('Dockerfile')],
        {
          stdio: 'inherit',
          cwd: testPackageRoot,
        },
      );

      // Verify the result uses 'latest' version
      expect(result).toEqual({
        tag: 'pl-pkg-python-test-python-package:latest',
        packageName: 'test-python-package',
        packageVersion: 'latest',
        pythonVersion: '3.12.6',
        requirementsFile: 'requirements.txt',
        toolset: 'pip',
      });
    });
  });
});
