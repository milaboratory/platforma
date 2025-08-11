import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generatePythonDockerfile,
  buildPythonDockerImage,
  getPythonVersionFromEnvironment,
  getDefaultPythonDependencies,
  type PythonDockerOptions,
} from '../python-docker';
import type { PythonPackage } from '../package-info';
import type winston from 'winston';

// Mock the pkg.assets function
import { vi } from 'vitest';

vi.mock('../package', () => ({
  assets: (file: string) => `/tmp/mock-assets/${file}`,
}));

// Mock winston logger
const mockLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
} as unknown as winston.Logger;

// Mock Python package for testing
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
    requirements: 'requirements.txt',
  },
};

describe('Python Docker Functions', () => {
  let tempDir: string;
  let testPackageRoot: string;

  beforeEach(() => {
    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'python-docker-test-'));
    testPackageRoot = path.join(tempDir, 'package');
    fs.mkdirSync(testPackageRoot, { recursive: true });

    // Create mock assets directory
    const mockAssetsDir = '/tmp/mock-assets';
    fs.mkdirSync(mockAssetsDir, { recursive: true });
    fs.writeFileSync(path.join(mockAssetsDir, 'python-dockerfile.template'),
      '# Auto-generated Dockerfile for Python package\nFROM python:${PYTHON_VERSION}-slim\n\nWORKDIR /app\n\n# Copy package source\nCOPY . /app/\n\n# Install dependencies if requirements.txt exists\n${PYTHON_INSTALL_DEPS}\n\n# Set Python path\nENV PYTHONPATH=/app\n\n# Default command (will be overridden by entrypoint)\nCMD ["python", "--version"]\n');

    // Create a mock requirements.txt file
    fs.writeFileSync(path.join(testPackageRoot, 'requirements.txt'), 'requests>=2.25.0\n');
  });

  afterEach(() => {
    // Clean up temporary directories
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe('generatePythonDockerfile', () => {
    it('should generate Dockerfile with default options', () => {
      const dockerfile = generatePythonDockerfile(testPackageRoot, mockPythonPackage);

      expect(dockerfile).toContain('FROM python:3.12.6-slim');
      expect(dockerfile).toContain('WORKDIR /app');
      expect(dockerfile).toContain('COPY . /app/');
      expect(dockerfile).toContain('RUN pip install --no-cache-dir -r requirements.txt');
      expect(dockerfile).toContain('ENV PYTHONPATH=/app');
      expect(dockerfile).toContain('CMD ["python", "--version"]');
    });

    it('should generate Dockerfile with custom options', () => {
      const options: PythonDockerOptions = {
        pythonVersion: '3.11.0',
        requirementsFile: 'custom-requirements.txt',
        _toolset: 'pip',
      };

      // Create custom requirements file for this test
      fs.writeFileSync(path.join(testPackageRoot, 'custom-requirements.txt'), 'numpy>=1.20.0\n');

      const dockerfile = generatePythonDockerfile(testPackageRoot, mockPythonPackage, options);

      expect(dockerfile).toContain('FROM python:3.11.0-slim');
      expect(dockerfile).toContain('RUN pip install --no-cache-dir -r custom-requirements.txt');
    });

    it('should handle missing requirements.txt gracefully', () => {
      // Remove requirements.txt
      fs.unlinkSync(path.join(testPackageRoot, 'requirements.txt'));

      const dockerfile = generatePythonDockerfile(testPackageRoot, mockPythonPackage);

      expect(dockerfile).toContain('FROM python:3.12.6-slim');
      expect(dockerfile).not.toContain('RUN pip install');
    });
  });

  describe('getPythonVersionFromEnvironment', () => {
    it('should extract version from environment ID', () => {
      const version = getPythonVersionFromEnvironment('@platforma-open/milaboratories.runenv-python-3:3.12.6');
      expect(version).toBe('3.12.6');
    });

    it('should extract version from environment ID with different format', () => {
      const version = getPythonVersionFromEnvironment('@platforma-open/milaboratories.runenv-python-3:3.11.0');
      expect(version).toBe('3.11.0');
    });

    it('should return undefined for environment ID without version', () => {
      const version = getPythonVersionFromEnvironment('@platforma-open/milaboratories.runenv-python-3');
      expect(version).toBeUndefined();
    });

    it('should return undefined for empty environment ID', () => {
      const version = getPythonVersionFromEnvironment('');
      expect(version).toBeUndefined();
    });
  });

  describe('getDefaultPythonDependencies', () => {
    it('should return default dependencies', () => {
      const dependencies = getDefaultPythonDependencies(mockPythonPackage);

      expect(dependencies.toolset).toBe('pip');
      expect(dependencies.requirements).toBe('requirements.txt');
    });
  });

  describe('buildPythonDockerImage', () => {
    it('should skip Docker build on non-Linux platforms', () => {
      // Skip this test on non-Linux platforms since we can't easily mock os.platform
      if (os.platform() === 'linux') {
        // On Linux, this should not be null (though we can't test the full Docker build)
        expect(() => {
          buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);
        }).not.toThrow();
      } else {
        // On non-Linux, this should return null
        const result = buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);
        expect(result).toBeNull();
      }
    });

    it('should build Docker image on Linux platforms', () => {
      // This test would need more complex mocking to fully test Docker build
      // For now, we just verify the function doesn't crash when called
      expect(() => {
        buildPythonDockerImage(mockLogger, testPackageRoot, mockPythonPackage);
      }).not.toThrow();
    });
  });
});
