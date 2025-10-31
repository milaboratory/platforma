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

  describe('allowed channels', () => {
    it('should accept conda-forge channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies:
  - python
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should accept bioconda channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - bioconda
dependencies:
  - anarci
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should accept multiple allowed channels', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - bioconda
  - conda-forge
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should accept spec without channels', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
dependencies:
  - python
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });
  });

  describe('forbidden channels', () => {
    it('should reject main channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
  - main
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel 'main'/);
    });

    it('should reject r channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - r
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel 'r'/);
    });

    it('should reject msys2 channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - msys2
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel 'msys2'/);
    });

    it('should be case insensitive for channel names', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - MAIN
  - R
  - Msys2
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel/);
    });

    it('should reject defaults channel (includes main)', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - defaults
  - conda-forge
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel 'defaults'/);
    });

    it('should reject URL format for main channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - https://repo.anaconda.com/pkgs/main
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel URL/);
    });

    it('should reject URL format for r channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - https://repo.anaconda.com/pkgs/r
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel URL/);
    });

    it('should reject URL format for msys2 channel', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - https://repo.anaconda.com/pkgs/msys2
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel URL/);
    });

    it('should reject URL format with trailing slash', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - https://repo.anaconda.com/pkgs/main/
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel URL/);
    });

    it('should reject URL format with http (non-https)', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - http://repo.anaconda.com/pkgs/main
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel URL/);
    });

    it('should reject URL format with anaconda.org domain', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - https://anaconda.org/main
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel URL/);
    });
  });

  describe('allowed dependencies', () => {
    it('should accept simple package names', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies:
  - python
  - numpy
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should accept packages with allowed channel prefix', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - bioconda
dependencies:
  - bioconda::anarci
  - conda-forge::python
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });
  });

  describe('forbidden dependencies', () => {
    it('should reject main::package', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies:
  - main::python
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel prefix 'main::'/);
    });

    it('should reject r::package', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - bioconda
dependencies:
  - r::some-package
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel prefix 'r::'/);
    });

    it('should reject msys2::package', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies:
  - msys2::git
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel prefix 'msys2::'/);
    });

    it('should be case insensitive for channel prefixes', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies:
  - MAIN::python
  - R::stats
  - Msys2::git
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel prefix/);
    });

    it('should reject defaults::package prefix (includes main)', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies:
  - defaults::python
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel prefix 'defaults::'/);
    });
  });

  describe('mixed scenarios', () => {
    it('should accept allowed channels with allowed dependencies', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - bioconda
  - conda-forge
dependencies:
  - anarci
  - bioconda::biotools
  - python
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should reject when both channels and dependencies have violations', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - main
  - conda-forge
dependencies:
  - main::python
  - anarci
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel 'main'/);
      expect(() => validateCondaSpec(specPath, mockLogger)).toThrow(/Forbidden channel prefix 'main::'/);
    });

    it('should reject multiple violations', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - main
  - r
  - msys2
dependencies:
  - main::python
  - r::stats
  - msys2::git
`);

      expect(() => {
        validateCondaSpec(specPath, mockLogger);
      }).toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle empty channels list', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels: []
dependencies:
  - python
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should handle empty dependencies list', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies: []
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should handle specs without dependencies section', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });

    it('should throw error for non-existent file', () => {
      expect(() => validateCondaSpec('/non-existent/path.yaml', mockLogger)).toThrow();
    });

    it('should handle dependencies with version constraints', async () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      await fsp.writeFile(specPath, `
channels:
  - conda-forge
dependencies:
  - python=3.9
  - numpy>=1.20.0
  - matplotlib<3.5
`);

      expect(() => validateCondaSpec(specPath, mockLogger)).not.toThrow();
    });
  });
});




