import { randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, test, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';

import * as util from './util';
import { Entrypoint, PackageInfo, SoftwareEntrypoint } from './package-info';
import { Renderer, entrypointFilePath, readEntrypointDescriptor } from './renderer';
import * as testartifacts from './test-artifacts';
import { createLogger } from './util';
import { Logger } from 'winston';

describe('Renderer tests', () => {
  let tempDir: string;
  let i: PackageInfo;
  const l = createLogger('error');

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-temp-dir-'));
  });

  beforeEach(() => {
    const fakePackageRoot = path.join(tempDir, randomBytes(16).toString('hex'));
    i = new PackageInfo(l, {
      pkgJsonData: testartifacts.PackageJson,
      packageRoot: fakePackageRoot
    });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  test('render asset', () => {
    const epName = testartifacts.EPNameAsset;
    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    const url = descriptor.asset!.url;
    const expectedPath = `${testartifacts.BinaryRegistryURL}/${testartifacts.PackageNameNoAt}/pAsset/${testartifacts.PackageVersion}.zip`;
    expect(url).toEqual(expectedPath);
  });

  test('render os-dependant', () => {
    const epName = testartifacts.EPNameCustomName;
    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    expect(descriptor.binary!.package).toEqual(
      `${testartifacts.BinaryCustomName1}/${testartifacts.BinaryCustomVersion}-{os}-{arch}.tgz`
    );
  });

  test('render environment', () => {
    const epName = testartifacts.EPNameJavaEnvironment;
    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    expect(descriptor.runEnv!.package).toEqual(
      `${testartifacts.PackageNameNoAt}/pEnv/${testartifacts.PackageVersion}-{os}-{arch}.tgz`
    );
    expect(descriptor.runEnv!.type).toEqual('java');
    expect(descriptor.runEnv!.binDir).toEqual('.');
  });

  test('read descriptor after render', () => {
    const epName = testartifacts.EPNameCustomName;
    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const renderedDescriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    sw.writeEntrypointDescriptor(renderedDescriptor);

    const epPath = entrypointFilePath(
      i.packageRoot,
      renderedDescriptor.asset ? 'asset' : 'software',
      epName
    );
    const parsedDescriptor = readEntrypointDescriptor(i.packageName, epName, epPath);

    expect(parsedDescriptor.binary).toEqual(renderedDescriptor.binary);
  });

  test('render with environment dependency', () => {
    const envEpName = testartifacts.EPNameJavaEnvironment;
    const epName = testartifacts.EPNameJavaDependency;

    const renderer = new Renderer(l, i.packageName, i.packageRoot);
    const envEps = new Map([[envEpName, i.getEntrypoint(envEpName)]]);

    const envDescriptor = renderer.renderSoftwareEntrypoints('release', envEps).get(envEpName)!;
    renderer.writeEntrypointDescriptor(envDescriptor);

    const eps = new Map([[epName, i.getEntrypoint(epName)]]);

    const descriptor = renderer.renderSoftwareEntrypoints('release', eps).get(epName)!;
    expect(descriptor.binary!.package).toEqual(
      `${testartifacts.PackageNameNoAt}/pEnvDep/${testartifacts.PackageVersion}.tgz`
    );
  });
});

test.skip('should render descriptor from an entrypoint', () => {
  const logger = new Logger();
  const renderer = new Renderer(
    logger,
    '@milaboratories/test.software',
    '/test/path/to/this/package'
  );

  const envEpName = testartifacts.EPNamePythonEnvironment;

  const envDescriptor = renderer
    .renderSoftwareEntrypoints(
      'release',
      new Map([
        [
          envEpName,
          {
            type: 'software',
            name: envEpName,
            package: {
              platforms: ['linux-x64'],
              fullName(platform: util.PlatformType) {
                return 'fullName';
              },
              namePattern: 'namePattern',
              name: 'python-test',
              crossplatform: true,
              contentRoot(platform: util.PlatformType) {
                return './src';
              },

              registry: {
                name: '${BinaryRegistry}'
              },

              id: 'python-test',
              isBuildable: true,
              isMultiroot: true,

              type: 'python',
              version: '1.0.0',
              environment: '@platforma-open/milaboratories.runenv-python-3:3.12.6',
              dependencies: {
                toolset: 'pip',
                requirements: 'requirements.txt'
              },
              root: './src_python'
            },
            oldCmd: ['python', '{pkg}/hello.py'],
            command: ['python', '{{pkg}}/hello.py'],
            env: ['PATH=abc']
          } satisfies Entrypoint
        ]
      ])
    )
    .get(envEpName)!;

  expect(envDescriptor.binary!.package).toEqual(
    `${testartifacts.PackageNameNoAt}/pEnvDep/${testartifacts.PackageVersion}.tgz`
  );
});
