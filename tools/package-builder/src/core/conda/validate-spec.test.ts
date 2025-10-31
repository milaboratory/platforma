import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fsp from 'node:fs/promises';
import { validateCondaSpec } from './validate-spec';
import * as util from '../util';

describe('validateCondaSpec', () => {
  let tempDir: string;
  const mockLogger = util.createLogger();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-conda-spec-test'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createSpec = async (content: string): Promise<string> => {
    const specPath = path.join(tempDir, 'spec.yaml');
    await fsp.writeFile(specPath, content);
    return specPath;
  };

  const expectValid = async (content: string) => {
    const specPath = await createSpec(content);
    expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
  };

  const expectInvalid = async (content: string, errorPattern: RegExp) => {
    const specPath = await createSpec(content);
    expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(errorPattern);
  };

  describe('allowed channels', () => {
    it('should accept single allowed channel', async () => {
      await expectValid(`
channels:
  - bioconda
dependencies:
  - anarci
`);
    });

    it('should accept multiple allowed channels', async () => {
      await expectValid(`
channels:
  - bioconda
  - conda-forge
dependencies: []
`);
    });
  });

  describe('forbidden channels', () => {
    const forbiddenChannels = [
      { name: 'main', variations: ['main', 'MAIN'] },
      { name: 'r', variations: ['r', 'R'] },
      { name: 'msys2', variations: ['msys2', 'Msys2'] },
    ];

    forbiddenChannels.forEach(({ name, variations }) => {
      variations.forEach((variation) => {
        it(`should reject ${name} channel (${variation})`, async () => {
          await expectInvalid(
            `
channels:
  - conda-forge
  - ${variation}
dependencies: []
`,
            new RegExp(`Forbidden channel '${variation}'`),
          );
        });
      });
    });
  });

  describe('allowed dependencies', () => {
    it('should accept simple package names', async () => {
      await expectValid(`
channels:
  - conda-forge
dependencies:
  - python
  - numpy
`);
    });

    it('should accept packages with allowed channel prefix', async () => {
      await expectValid(`
channels:
  - bioconda
dependencies:
  - bioconda::anarci
  - conda-forge::python
`);
    });
  });

  describe('forbidden dependencies prefixes (case insensitive)', () => {
    const forbiddenPrefixes = [
      { prefix: 'main', package: 'python' },
      { prefix: 'MAIN', package: 'stats' },
      { prefix: 'r', package: 'some-package' },
      { prefix: 'R', package: 'some-package' },
      { prefix: 'msys2', package: 'git' },
      { prefix: 'Msys2', package: 'git' },
    ];

    forbiddenPrefixes.forEach(({ prefix, package: pkg }) => {
      it(`should reject ${prefix}::${pkg}`, async () => {
        await expectInvalid(
          `
channels:
  - conda-forge
dependencies:
  - ${prefix}::${pkg}
`,
          new RegExp(`Forbidden channel prefix '${prefix}::'`),
        );
      });
    });
  });

  describe('mixed scenarios', () => {
    it('should accept allowed channels with allowed dependencies', async () => {
      await expectValid(`
channels:
  - bioconda
  - conda-forge
dependencies:
  - anarci
  - bioconda::biotools
  - python
`);
    });

    it('should reject when both channels and dependencies have violations', async () => {
      const content = `
channels:
  - main
  - conda-forge
dependencies:
  - main::python
  - anarci
`;
      const specPath = await createSpec(content);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(
        /Forbidden channel 'main'[\s\S]*Forbidden channel prefix 'main::'/,
      );
    });

    it('should reject multiple violations', async () => {
      await expectInvalid(
        `
channels:
  - main
  - r
  - msys2
dependencies:
  - main::python
  - r::stats
  - msys2::git
`,
        /.+/,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty channels list', async () => {
      await expectValid(`
channels: []
dependencies:
  - python
`);
    });

    it('should handle empty dependencies list', async () => {
      await expectValid(`
channels:
  - conda-forge
dependencies: []
`);
    });

    it('should handle specs without dependencies section', async () => {
      await expectValid(`
channels:
  - conda-forge
`);
    });

    it('should throw error for non-existent file', () => {
      expect(() => validateCondaSpec('/non-existent/path.yaml', mockLogger)).toThrow();
    });

    it('should handle dependencies with version constraints', async () => {
      await expectValid(`
channels:
  - conda-forge
dependencies:
  - python=3.9
  - numpy>=1.20.0
  - matplotlib<3.5
`);
    });
  });
});
