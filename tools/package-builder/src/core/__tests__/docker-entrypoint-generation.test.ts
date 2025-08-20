import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PackageInfo } from '../package-info';
import type winston from 'winston';

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

// Mock the docker-python module
vi.mock('../docker-python', () => ({
  prepareDockerOptions: vi.fn().mockReturnValue({
    context: '/tmp/test-context',
    dockerfile: '/tmp/test-dockerfile',
    entrypoint: [],
  }),
}));

describe('Docker Entrypoint Generation', () => {
  let tempDir: string;
  let testPackageRoot: string;
  let packageInfo: PackageInfo;

  beforeEach(() => {
    // Set up OS mocks
    vi.mocked(os.platform).mockReturnValue('linux');
    vi.mocked(os.tmpdir).mockReturnValue('/tmp');

    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join('/tmp', 'docker-entrypoint-test-'));
    testPackageRoot = path.join(tempDir, 'package');

    fs.mkdirSync(testPackageRoot, { recursive: true });
    fs.mkdirSync(path.join(testPackageRoot, 'docker'), { recursive: true });

    // Create a mock requirements.txt file
    fs.writeFileSync(path.join(testPackageRoot, 'requirements.txt'), 'requests>=2.25.0\n');

    // Create a mock Dockerfile template
    const templateDir = path.dirname(path.join(__dirname, '../../../assets/python-dockerfile.template'));
    fs.mkdirSync(templateDir, { recursive: true });
    fs.writeFileSync(
      path.join(templateDir, 'python-dockerfile.template'),
      `FROM python:\${PYTHON_VERSION}-slim
WORKDIR /app
\${PYTHON_INSTALL_DEPS}
COPY . /app/
ENV PYTHONPATH=/app
CMD ["python", "--version"]`
    );

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

  describe('Automatic Docker Entrypoint Generation', () => {
    it('should generate Docker entrypoint for Python binary entrypoint without docker config', () => {
      // Create package.json with Python binary entrypoint
      const packageJson = {
        name: 'test-python-package',
        version: '1.0.0',
        'block-software': {
          artifacts: {
            'python-pkg': {
              type: 'python',
              environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
              root: './src',
              registry: 'test-registry',
            },
          },
          entrypoints: {
            'script1': {
              binary: {
                artifact: {
                  type: 'python',
                  environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
                  root: './src',
                  registry: 'test-registry',
                },
                cmd: ['{pkg}/script1'],
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(testPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create PackageInfo instance
      packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });

      // Get entrypoints
      const entrypoints = packageInfo.entrypoints;

      // Should have both the original entrypoint and the Docker entrypoint
      expect(entrypoints.has('script1')).toBe(true);
      expect(entrypoints.has('script1:docker')).toBe(true);

      // Check original entrypoint
      const originalEntrypoint = entrypoints.get('script1')!;
      expect(originalEntrypoint.type).toBe('software');
      if (originalEntrypoint.type === 'software') {
        expect(originalEntrypoint.package.type).toBe('python');
      }

      // Check Docker entrypoint
      const dockerEntrypoint = entrypoints.get('script1:docker')!;
      expect(dockerEntrypoint.type).toBe('software');
      if (dockerEntrypoint.type === 'software') {
        expect(dockerEntrypoint.package.type).toBe('docker');
        expect(dockerEntrypoint.cmd).toEqual(['{pkg}/script1']);
        expect(dockerEntrypoint.env).toEqual([]);
      }
    });

    it('should not generate Docker entrypoint when docker config already exists', () => {
      // Create package.json with Python binary entrypoint that already has docker config
      const packageJson = {
        name: 'test-python-package',
        version: '1.0.0',
        'block-software': {
          artifacts: {
            'python-pkg': {
              type: 'python',
              environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
              root: './src',
              registry: 'test-registry',
            },
          },
          entrypoints: {
            'script1': {
              binary: {
                artifact: {
                  type: 'python',
                  environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
                  root: './src',
                  registry: 'test-registry',
                },
                cmd: ['{pkg}/script1'],
              },
              docker: {
                artifact: {
                  type: 'docker',
                  context: '.',
                  dockerfile: 'Dockerfile',
                  registry: 'test-registry',
                },
                cmd: ['docker-cmd'],
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(testPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create PackageInfo instance
      packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });

      // Get entrypoints
      const entrypoints = packageInfo.entrypoints;

      // Should have the original entrypoint and the explicit docker entrypoint
      expect(entrypoints.has('script1')).toBe(true);
      expect(entrypoints.has('script1:docker')).toBe(true);

      // Check original entrypoint
      const originalEntrypoint = entrypoints.get('script1')!;
      expect(originalEntrypoint.type).toBe('software');
      if (originalEntrypoint.type === 'software') {
        expect(originalEntrypoint.package.type).toBe('python');
      }

      // Check that the docker entrypoint is the explicit one, not auto-generated
      const dockerEntrypoint = entrypoints.get('script1:docker')!;
      expect(dockerEntrypoint.type).toBe('software');
      if (dockerEntrypoint.type === 'software') {
        expect(dockerEntrypoint.package.type).toBe('docker');
        expect(dockerEntrypoint.cmd).toEqual(['docker-cmd']);
      }
    });

    it('should not generate Docker entrypoint for non-Python packages', () => {
      // Create package.json with binary entrypoint (not Python)
      const packageJson = {
        name: 'test-binary-package',
        version: '1.0.0',
        'block-software': {
          artifacts: {
            'binary-pkg': {
              type: 'binary',
              root: './src',
              registry: 'test-registry',
            },
          },
          entrypoints: {
            'script1': {
              binary: {
                artifact: {
                  type: 'binary',
                  root: './src',
                  registry: 'test-registry',
                },
                cmd: ['{pkg}/script1'],
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(testPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create PackageInfo instance
      packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });

      // Get entrypoints
      const entrypoints = packageInfo.entrypoints;

      // Should only have the original entrypoint, no Docker entrypoint
      expect(entrypoints.has('script1')).toBe(true);
      expect(entrypoints.has('script1:docker')).toBe(false);

      // Check original entrypoint
      const originalEntrypoint = entrypoints.get('script1')!;
      expect(originalEntrypoint.type).toBe('software');
      if (originalEntrypoint.type === 'software') {
        expect(originalEntrypoint.package.type).toBe('binary');
      }
    });

    it('should generate Docker entrypoint with correct command and environment variables', () => {
      // Create package.json with Python binary entrypoint and environment variables
      const packageJson = {
        name: 'test-python-package',
        version: '1.0.0',
        'block-software': {
          artifacts: {
            'python-pkg': {
              type: 'python',
              environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
              root: './src',
              registry: 'test-registry',
            },
          },
          entrypoints: {
            'script1': {
              binary: {
                artifact: {
                  type: 'python',
                  environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
                  root: './src',
                  registry: 'test-registry',
                },
                cmd: ['{pkg}/script1', '--arg', 'value'],
                envVars: ['ENV_VAR1=value1', 'ENV_VAR2=value2'],
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(testPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create PackageInfo instance
      packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });

      // Get entrypoints
      const entrypoints = packageInfo.entrypoints;

      // Check Docker entrypoint has correct command and environment
      const dockerEntrypoint = entrypoints.get('script1:docker')!;
      expect(dockerEntrypoint.type).toBe('software');
      if (dockerEntrypoint.type === 'software') {
        expect(dockerEntrypoint.cmd).toEqual(['{pkg}/script1', '--arg', 'value']);
        expect(dockerEntrypoint.env).toEqual(['ENV_VAR1=value1', 'ENV_VAR2=value2']);
      }
    });

    it('should handle entrypoint with object artifact reference', () => {
      // Create package.json with object artifact reference
      const packageJson = {
        name: 'test-python-package',
        version: '1.0.0',
        'block-software': {
          entrypoints: {
            'script1': {
              binary: {
                artifact: {
                  type: 'python',
                  environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
                  root: './src',
                  registry: 'test-registry',
                },
                cmd: ['{pkg}/script1'],
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(testPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create PackageInfo instance
      packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });

      // Get entrypoints
      const entrypoints = packageInfo.entrypoints;

      // Should have both entrypoints
      expect(entrypoints.has('script1')).toBe(true);
      expect(entrypoints.has('script1:docker')).toBe(true);

      // Both should reference the same package
      const originalEntrypoint = entrypoints.get('script1')!;
      const dockerEntrypoint = entrypoints.get('script1:docker')!;
      if (originalEntrypoint.type === 'software') {
        expect(originalEntrypoint.package.type).toBe('python');
      }
      if (dockerEntrypoint.type === 'software') {
        expect(dockerEntrypoint.package.type).toBe('docker');
      }
    });
  });

  describe('Docker Entrypoint Naming', () => {
    it('should use correct Docker entrypoint naming convention', () => {
      // Create package.json with Python binary entrypoint
      const packageJson = {
        name: 'test-python-package',
        version: '1.0.0',
        'block-software': {
          artifacts: {
            'python-pkg': {
              type: 'python',
              environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
              root: './src',
              registry: 'test-registry',
            },
          },
          entrypoints: {
            'my-script': {
              binary: {
                artifact: {
                  type: 'python',
                  environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
                  root: './src',
                  registry: 'test-registry',
                },
                cmd: ['{pkg}/script1'],
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(testPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create PackageInfo instance
      packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });

      // Get entrypoints
      const entrypoints = packageInfo.entrypoints;

      // Should have Docker entrypoint with correct naming
      expect(entrypoints.has('my-script')).toBe(true);
      expect(entrypoints.has('my-script:docker')).toBe(true);
    });
  });

  describe('Integration with prepareDockerPackage', () => {
    it('should call prepareDockerPackage for Python packages', () => {
      // Create package.json with Python binary entrypoint
      const packageJson = {
        name: 'test-python-package',
        version: '1.0.0',
        'block-software': {
          artifacts: {
            'python-pkg': {
              type: 'python',
              environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
              root: './src',
              registry: 'test-registry',
            },
          },
          entrypoints: {
            'script1': {
              binary: {
                artifact: {
                  type: 'python',
                  environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
                  root: './src',
                  registry: 'test-registry',
                },
                cmd: ['{pkg}/script1'],
              },
            },
          },
        },
      };

      fs.writeFileSync(path.join(testPackageRoot, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Create PackageInfo instance
      packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });

      // Get entrypoints
      const entrypoints = packageInfo.entrypoints;

      // Check that Docker entrypoint was created
      const dockerEntrypoint = entrypoints.get('script1:docker')!;
      expect(dockerEntrypoint).toBeDefined();
      if (dockerEntrypoint.type === 'software') {
        expect(dockerEntrypoint.package.type).toBe('docker');

        // Verify the package was properly converted
        expect(dockerEntrypoint.package).toHaveProperty('context');
        expect(dockerEntrypoint.package).toHaveProperty('dockerfile');
        expect(dockerEntrypoint.package).toHaveProperty('entrypoint');
      }
    });
  });
});
