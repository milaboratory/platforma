import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generatePythonDockerfile,
  buildPythonDockerImage,
  getPythonVersionFromEnvironment,
  getDefaultPythonDockerOptions,
  type PythonDockerOptions,
} from '../python-docker';
import type { PythonPackage } from '../package-info';
import type winston from 'winston';

import { vi } from 'vitest';

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

describe('Python Docker Functions', () => {
  let tempDir: string;
  let testPackageRoot: string;

  beforeEach(() => {
    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'python-docker-test-'));
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

      expect(dockerfile).toMatch(/FROM python:3\.11\.0-slim/);
      expect(dockerfile).toContain(`RUN pip install --no-cache-dir -r ${customRequirementsFile}`);
    });

    it('should handle missing requirements.txt gracefully', () => {
      fs.unlinkSync(path.join(testPackageRoot, 'requirements.txt'));

      const dockerfile = generatePythonDockerfile(testPackageRoot, mockPythonPackage);

      expect(dockerfile).toMatch(/FROM python:3\.12\.6-slim/);
      expect(dockerfile).not.toContain('RUN pip install');
    });
  });

  describe('getPythonVersionFromEnvironment', () => {
    const testCases = [
      { input: '@platforma-open/milaboratories.runenv-python-3:3.12.6', expected: '3.12.6' },
      { input: '@platforma-open/milaboratories.runenv-python-3:3.11.0', expected: '3.11.0' },
      { input: '@platforma-open/milaboratories.runenv-python-3', expected: undefined },
      { input: '', expected: undefined },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should extract version from "${input}"`, () => {
        const version = getPythonVersionFromEnvironment(input);
        expect(version).toBe(expected);
      });
    });
  });

  describe('getDefaultPythonDockerOptions', () => {
    it('should return correct default options', () => {
      const options = getDefaultPythonDockerOptions();

      expect(options).toEqual({
        pythonVersion: '3.12.6',
        toolset: 'pip',
        requirementsFile: 'requirements.txt',
      });
    });
  });

  describe('buildPythonDockerImage', () => {
    it('should handle platform-specific behavior', () => {
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
  });
});
