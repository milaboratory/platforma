import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { getRunEnvironmentPythonInfo, prepareDockerOptions } from '../docker-python';
import type * as artifacts from '../schemas/artifacts';
import type winston from 'winston';
import * as util from '../util';

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
let mockPythonPackage: artifacts.pythonType;

const createRunEnvironmentSwJson = (packageRoot: string, runenvArtifactID: string, pythonVersion: string, envVars: string[]) => {
  const [runenvPackageName, runenvEntrypointName] = util.rSplit(runenvArtifactID, ':', 2);

  const entrypointPath = path.join(
    packageRoot,
    'node_modules',
    runenvPackageName,
    'dist',
    'tengo',
    'software',
    runenvEntrypointName + '.sw.json',
  );
  fs.mkdirSync(path.dirname(entrypointPath), { recursive: true });

  fs.writeFileSync(entrypointPath, JSON.stringify({
    name: `${runenvPackageName}:${runenvEntrypointName}`,
    runEnv: {
      'type': 'python',
      'python-version': pythonVersion,
      'envVars': envVars,
      'registry': 'example-python-registry',
      'package': 'software/package-path/py3/1.1.0-{os}-{arch}.tgz',
      'binDir': '.',
    },
  }, null, 2));
};

describe('Docker Python Functions', () => {
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

    // Create a mock requirements.txt file
    fs.writeFileSync(path.join(testPackageRoot, 'requirements.txt'), 'requests>=2.25.0\n');

    createRunEnvironmentSwJson(testPackageRoot, '@platforma-open/milaboratories.runenv-python-3:3.12.10', '3.12.10', []);

    // Initialize mockPythonPackage with absolute path
    mockPythonPackage = {
      'name': 'test-python-package',
      'version': '1.0.0',
      'type': 'python',
      'environment': '@platforma-open/milaboratories.runenv-python-3:3.12.10',
      'registry': { name: 'test' },
      'docker-registry': 'test-docker-registry',
      'root': path.join(testPackageRoot, 'src'), // Use absolute path
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
      expect(fs.existsSync(path.join(testPackageRoot, 'dist', 'docker'))).toBe(false);

      const result = prepareDockerOptions(mockLogger, testPackageRoot, 'test-package', 'artifact-id', mockPythonPackage);

      // Verify directories were created
      expect(fs.existsSync(path.join(testPackageRoot, 'dist'))).toBe(true);
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

    it('should prepare Docker options with default Python settings', () => {
      const result = prepareDockerOptions(mockLogger, testPackageRoot, 'test-package', 'artifact-id', mockPythonPackage);

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

    it('should use default Python version when environment has no version', () => {
      createRunEnvironmentSwJson(testPackageRoot, '@platforma-open/milaboratories.runenv-python-3:aaa', '', []);

      const packageWithoutVersion: artifacts.pythonType = {
        ...mockPythonPackage,
        environment: '@platforma-open/milaboratories.runenv-python-3:aaa',
        root: path.join(testPackageRoot, 'src'), // Use absolute path
      };

      const result = prepareDockerOptions(mockLogger, testPackageRoot, 'test-package', 'artifact-id', packageWithoutVersion);

      expect(mockLogger.debug).toHaveBeenCalledWith('No Python version found in environment, using default: python:3.12-slim');
      expect(result).toBeDefined();
    });

    it('should generate Dockerfile with correct content', () => {
      const result = prepareDockerOptions(mockLogger, testPackageRoot, 'test-package', 'artifact-id', mockPythonPackage);

      const dockerfileContent = fs.readFileSync(result.dockerfile, 'utf-8');

      // Check essential Dockerfile components
      expect(dockerfileContent).toContain('FROM python:3.12-slim');
      expect(dockerfileContent).toContain('WORKDIR /app/');
      expect(dockerfileContent).toContain('COPY . /app/');
      expect(dockerfileContent).toContain('COPY');
      expect(dockerfileContent).toContain('RUN pip install --no-cache-dir -r requirements.txt');
      expect(dockerfileContent).toContain('ENV PYTHONPATH=/app/');
      expect(dockerfileContent).toContain('CMD ["bash"]');
    });

    it('should handle missing requirements.txt gracefully', () => {
      // Remove requirements.txt
      fs.unlinkSync(path.join(testPackageRoot, 'requirements.txt'));

      const result = prepareDockerOptions(mockLogger, testPackageRoot, 'test-package', 'artifact-id', mockPythonPackage);

      const dockerfileContent = fs.readFileSync(result.dockerfile, 'utf-8');
      expect(dockerfileContent).toContain('COPY');
      expect(dockerfileContent).toContain('RUN pip install --no-cache-dir -r requirements.txt');

      // Check that empty requirements.txt was created in context directory (src)
      const emptyRequirementsPath = path.join(testPackageRoot, 'src', 'requirements.txt');
      expect(fs.existsSync(emptyRequirementsPath)).toBe(true);
      const emptyRequirementsContent = fs.readFileSync(emptyRequirementsPath, 'utf-8');
      expect(emptyRequirementsContent).toContain('# No dependencies specified');

      // Should still create valid Docker options
      expect(result).toBeDefined();
      expect(result.dockerfile).toBeDefined();
    });
  });
});

describe('getPythonVersionFromEnvironment', () => {
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
    vi.clearAllMocks();
  });

  const rawCases: [string, string, string][] = [
    // Explicit version specified in the runenv
    // ['@platforma-open/milaboratories.runenv-python-3:py-default', '3.12.0', '3.12.0'],
    // ['@platforma-open/milaboratories.runenv-python-3:3.10.10', '3.4.5', '3.4.5'],

    // Standard versions
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6', '', '3.12.6'],
    ['@platforma-open/milaboratories.runenv-python-3:3.11.0', '', '3.11.0'],

    // Pre-releases
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6-rc1', '', '3.12.6-rc1'],
    ['@platforma-open/milaboratories.runenv-python-3:3.13.0a1', '', '3.13.0a1'],
    ['@platforma-open/milaboratories.runenv-python-3:3.13.0b2', '', '3.13.0b2'],

    // With tags/suffixes
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6:latest', '', '3.12.6:latest'],
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6+dev', '', '3.12.6+dev'],
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6_dev', '', '3.12.6_dev'],
  ];

  const dockerSafeCases: [string, string, string][] = [
    // Explicit version specified in the runenv
    ['@platforma-open/milaboratories.runenv-python-3:py-default', '3.12.0', '3.12.0'],
    ['@platforma-open/milaboratories.runenv-python-3:3.10.10', '3.4.5', '3.4.5'],

    // Second ":" is stripped
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6:latest', '', '3.12.6'],
    // Digest is stripped
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6@sha256:deadbeef', '', '3.12.6'],
    // Pre-release should remain valid
    ['@platforma-open/milaboratories.runenv-python-3:3.13.0b2@sha256:123', '', '3.13.0b2'],
    // With tags/suffixes
    ['@platforma-open/milaboratories.runenv-python-3:3.14.0rc2-bookworm', '', '3.14.0rc2-bookworm'],
    ['@platforma-open/milaboratories.runenv-python-3:3.9.23-alpine3.22', '', '3.9.23-alpine3.22'],
    ['@platforma-open/milaboratories.runenv-python-3:3.12.6-slim', '', '3.12.6-slim'],
    ['@platforma-open/milaboratories.runenv-python-3:3.13.7-windowsservercore-ltsc2025', '', '3.13.7-windowsservercore-ltsc2025'],
  ];

  const undefinedCases: [string, string[]][] = [
    ['@milaboratories/example-pl-package-runenv-1:python', ['MY_ENV_VAR=1234']],
    ['@milaboratories/example-pl-package-runenv-1:python', []],
  ];

  describe('without normalizeForDocker', () => {
    rawCases.forEach(([input, pyVersion, expected]) => {
      it(`should extract "${expected}" from "${input}"`, () => {
        createRunEnvironmentSwJson(testPackageRoot, input, pyVersion, ['MY_ENV_VAR=1234']);
        expect(getRunEnvironmentPythonInfo(mockLogger, testPackageRoot, 'test-package', input, { normalizeForDocker: false })).toStrictEqual({
          pythonVersion: expected,
          envVars: ['MY_ENV_VAR=1234'],
        });
      });
    });

    undefinedCases.forEach(([input, envVars]) => {
      it(`should return undefined for "${input}"`, () => {
        if (input !== '') {
          createRunEnvironmentSwJson(testPackageRoot, input, '', envVars);
        }
        expect(getRunEnvironmentPythonInfo(mockLogger, testPackageRoot, 'test-package', input, { normalizeForDocker: false })).toStrictEqual({
          pythonVersion: undefined,
          envVars,
        });
      });
    });
  });

  describe('with normalizeForDocker = true', () => {
    dockerSafeCases.forEach(([input, pyVersion, expected]) => {
      it(`should extract docker-safe "${expected}" from "${input}"`, () => {
        createRunEnvironmentSwJson(testPackageRoot, input, pyVersion, []);
        expect(getRunEnvironmentPythonInfo(mockLogger, testPackageRoot, 'test-package', input, { normalizeForDocker: true })).toStrictEqual({
          pythonVersion: expected,
          envVars: [],
        });
      });
    });

    undefinedCases.forEach(([input, envVars]) => {
      it(`should return undefined for "${input}"`, () => {
        if (input !== '') {
          createRunEnvironmentSwJson(testPackageRoot, input, '', envVars);
        }
        expect(getRunEnvironmentPythonInfo(mockLogger, testPackageRoot, 'test-package', input, { normalizeForDocker: true })).toStrictEqual({
          pythonVersion: undefined,
          envVars,
        });
      });
    });
  });
});
