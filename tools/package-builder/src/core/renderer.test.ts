import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

import * as artifacts from './test-artifacts';
import { PackageInfo } from './package-info';
import { Renderer, entrypointFilePath, readEntrypointDescriptor } from './renderer';
import { createLogger } from './util';
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';

const testDockerfileFolder = path.join(__dirname, '..', '__test__');
describe('Renderer tests', () => {
  let tempDir: string;
  let i: PackageInfo;
  const l = createLogger('error');

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-temp-dir-'));
  });

  beforeEach(() => {
    const fakePackageRoot = path.join(tempDir, randomBytes(16).toString('hex'));
    i = new PackageInfo(l, { pkgJsonData: artifacts.PackageJson, packageRoot: fakePackageRoot });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  test('render asset', () => {
    const epName = artifacts.EPNameAsset;
    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    const url = descriptor.asset!.url;
    const expectedPath = `${artifacts.BinaryRegistryURL}/${artifacts.PackageNameNoAt}/pAsset/${artifacts.PackageVersion}.zip`;
    expect(url).toEqual(expectedPath);
  });

  test('render os-dependant', () => {
    const epName = artifacts.EPNameCustomName;
    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    expect(descriptor.binary!.package).toEqual(
      `${artifacts.BinaryCustomName1}/${artifacts.BinaryCustomVersion}-{os}-{arch}.tgz`
    );
  });

  test('render environment', () => {
    const epName = artifacts.EPNameJavaEnvironment;
    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    expect(descriptor.runEnv!.package).toEqual(
      `${artifacts.PackageNameNoAt}/pEnv/${artifacts.PackageVersion}-{os}-{arch}.tgz`
    );
    expect(descriptor.runEnv!.type).toEqual('java');
    expect(descriptor.runEnv!.binDir).toEqual('.');
  });

  test('read descriptor after render', () => {
    const epName = artifacts.EPNameCustomName;
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
    const envEpName = artifacts.EPNameJavaEnvironment;
    const epName = artifacts.EPNameJavaDependency;

    const renderer = new Renderer(l, i.packageName, i.packageRoot);
    const envEps = new Map([[envEpName, i.getEntrypoint(envEpName)]]);

    const envDescriptor = renderer.renderSoftwareEntrypoints('release', envEps).get(envEpName)!;
    renderer.writeEntrypointDescriptor(envDescriptor);

    const eps = new Map([[epName, i.getEntrypoint(epName)]]);

    const descriptor = renderer.renderSoftwareEntrypoints('release', eps).get(epName)!;
    expect(descriptor.binary!.package).toEqual(
      `${artifacts.PackageNameNoAt}/pEnvDep/${artifacts.PackageVersion}.tgz`
    );
  });

  test('render docker', () => {
    const epName = artifacts.EPNameDocker;

    fs.mkdirSync(path.join(i.packageRoot, i.packageRoot), { recursive: true });
    fs.writeFileSync(path.join(i.packageRoot, 'Dockerfile'), "FROM scratch", )
    fs.writeFileSync(path.join(i.packageRoot, 'package.json'), artifacts.PackageJson);

    const sw = new Renderer(l, i.packageName, i.packageRoot);
    const eps = new Map([[epName, i.getEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    const expectedTag = new RegExp('quora\\.io/the-software\\.test-docker\\.(?<hash>.*):1\\.2\\.3');
    expect(descriptor.docker!.tag).toMatch(expectedTag);
    expect(descriptor.docker!.cmd).toEqual(['echo', 'hello']);
    expect(descriptor.docker!.entrypoint).toEqual(['/usr/bin/env', 'printf']);
  });
});
