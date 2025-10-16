import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

import * as artifacts from './schemas/artifacts';
import { PackageInfo } from './package-info';
import {
  descriptorFilePath,
  readDescriptorFile,
} from './resolver';
import {
  SwJsonRenderer,
  writeBuiltArtifactInfo,
} from './sw-json-render';
import * as test_assets from './schemas/test-artifacts';
import { createLogger } from './util';
import { describe, test, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as docker from './docker';
import * as util from './util';

describe('Renderer tests', () => {
  let tempDir: string;
  let i: PackageInfo;
  const l = createLogger('error');

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-temp-dir-'));
  });

  beforeEach(() => {
    const fakePackageRoot = path.join(tempDir, randomBytes(16).toString('hex'));
    i = new PackageInfo(l, { pkgJsonData: test_assets.PackageJson, packageRoot: fakePackageRoot });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  test('render asset', () => {
    const epName = test_assets.EPNameAsset;
    const assetPkg = i.getArtifact(epName, 'asset');
    const sw = new SwJsonRenderer(l, i);

    writeTestArtifactInfo(i, 'archive', assetPkg);
    const eps = new Map([[epName, i.getMainEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    const url = descriptor.asset!.url;
    const expectedPath = `${test_assets.BinaryRegistryURL}/assets/${test_assets.PackageNameNoAt}/pAsset/${test_assets.PackageVersion}.zip`;
    expect(url).toEqual(expectedPath);
  });

  test('render os-dependant', () => {
    const epName = test_assets.EPNameCustomName;
    const binPkg = i.getArtifact(epName, 'binary');
    const sw = new SwJsonRenderer(l, i);

    writeTestArtifactInfo(i, 'archive', binPkg);
    const eps = new Map([[epName, i.getMainEntrypoint(epName)]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    expect(descriptor.binary!.package).toEqual(
      `software/${test_assets.BinaryCustomName1}/${test_assets.BinaryCustomVersion}-{os}-{arch}.tgz`,
    );
  });

  test('render environment', () => {
    const epName = test_assets.EPNameJavaEnvironment;
    const envPkg = i.getArtifact(epName, 'environment');
    const sw = new SwJsonRenderer(l, i);

    writeTestArtifactInfo(i, 'archive', envPkg);
    const eps = new Map([[epName, i.entrypoints.get(epName)!]]);
    const descriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;

    expect(descriptor.runEnv!.package).toEqual(
      `software/${test_assets.PackageNameNoAt}/${test_assets.EPNameJavaEnvironment}/${test_assets.PackageVersion}-{os}-{arch}.tgz`,
    );
    expect(descriptor.runEnv!.type).toEqual('java');
    expect(descriptor.runEnv!.binDir).toEqual('.');
  });

  test('read descriptor after render', () => {
    const epName = test_assets.EPNameCustomName;
    const binPkg = i.getArtifact(epName, 'binary');
    const sw = new SwJsonRenderer(l, i);

    writeTestArtifactInfo(i, 'archive', binPkg);
    const eps = new Map([[epName, i.getMainEntrypoint(epName)]]);
    const renderedDescriptor = sw.renderSoftwareEntrypoints('release', eps).get(epName)!;
    sw.writeSwJson(renderedDescriptor);

    const epPath = descriptorFilePath(
      i.packageRoot,
      renderedDescriptor.asset ? 'asset' : 'software',
      epName,
    );
    const parsedDescriptor = readDescriptorFile(i.packageName, epName, epPath);

    expect(parsedDescriptor.binary).toEqual(renderedDescriptor.binary);
  });

  test('render with environment dependency', () => {
    const envEpName = test_assets.EPNameJavaEnvironment;
    const envPkg = i.getArtifact(envEpName, 'environment');
    const epName = test_assets.EPNameJava;
    const javaPkg = i.getArtifact(epName, 'java');

    const renderer = new SwJsonRenderer(l, i);

    writeTestArtifactInfo(i, 'archive', envPkg);
    const envEps = new Map([[envEpName, i.getMainEntrypoint(envEpName)]]);
    const envDescriptor = renderer.renderSoftwareEntrypoints('release', envEps).get(envEpName)!;
    renderer.writeSwJson(envDescriptor);

    writeTestArtifactInfo(i, 'archive', javaPkg);
    const eps = new Map([[epName, i.getMainEntrypoint(epName)]]);
    const descriptor = renderer.renderSoftwareEntrypoints('release', eps).get(epName)!;
    expect(descriptor.binary!.package).toEqual(
      `software/${test_assets.PackageNameNoAt}/${test_assets.EPNameJava}/${test_assets.PackageVersion}.tgz`,
    );
  });

  test('render docker with binary', () => {
    const envEpName = test_assets.EPNameJavaEnvironment;
    const envArtifact = i.getArtifact(envEpName, 'environment');
    writeTestArtifactInfo(i, 'archive', envArtifact);

    const javaEpName = test_assets.EPNameJava;
    const javaArtifact = i.getArtifact(javaEpName, 'java');
    writeTestArtifactInfo(i, 'archive', javaArtifact);

    const javaDockerEpName = docker.entrypointName(javaEpName);
    const dockerPkg = i.getArtifact(javaEpName, 'docker');
    writeTestArtifactInfo(i, 'docker', dockerPkg);

    fs.mkdirSync(path.join(i.packageRoot, i.packageRoot), { recursive: true });
    fs.mkdirSync(path.join(i.packageRoot, 'docker-context'), { recursive: true });
    fs.writeFileSync(path.join(i.packageRoot, 'Dockerfile'), 'FROM scratch');
    fs.writeFileSync(path.join(i.packageRoot, 'package.json'), test_assets.PackageJson);

    const render = new SwJsonRenderer(l, i);

    const envEps = new Map([[envEpName, i.getMainEntrypoint(envEpName)]]);
    const envDescriptor = render.renderSoftwareEntrypoints('release', envEps).get(envEpName)!;
    render.writeSwJson(envDescriptor);

    const eps = new Map([[javaDockerEpName, i.getMainEntrypoint(javaDockerEpName)], [javaEpName, i.getMainEntrypoint(javaEpName)]]);
    const javaDescriptor = render.renderSoftwareEntrypoints('release', eps).get(javaEpName)!;
    render.writeSwJson(javaDescriptor);

    const expectedTag = new RegExp(`${docker.defaultDockerRegistry}:${test_assets.PackageNameNoAt}\\.${javaEpName}\\.(?<hash>.*)`);
    expect(javaDescriptor.docker).toBeDefined();
    expect(javaDescriptor.docker!.tag).toMatch(expectedTag);
    expect(javaDescriptor.docker!.cmd).toEqual(['java', '-jar', 'hello.jar']);
  });

  test('render docker indinvidual entrypoint', () => {
    const dockerEpName = test_assets.EPNameDocker;
    const dockerPkg = i.getArtifact(dockerEpName, 'docker');
    writeTestArtifactInfo(i, 'docker', dockerPkg);

    fs.mkdirSync(path.join(i.packageRoot, i.packageRoot), { recursive: true });
    fs.mkdirSync(path.join(i.packageRoot, 'docker-context'), { recursive: true });
    fs.writeFileSync(path.join(i.packageRoot, 'Dockerfile'), 'FROM scratch');
    fs.writeFileSync(path.join(i.packageRoot, 'package.json'), test_assets.PackageJson);

    const render = new SwJsonRenderer(l, i);

    const eps = new Map([[dockerEpName, i.getMainEntrypoint(dockerEpName)]]);
    const dockerDescriptor = render.renderSoftwareEntrypoints('release', eps).get(dockerEpName)!;

    const expectedTag = new RegExp(`${docker.defaultDockerRegistry}:${test_assets.PackageNameNoAt}\\.${dockerEpName}\\.(?<hash>.*)`);
    expect(dockerDescriptor.docker).toBeDefined();
    expect(dockerDescriptor.docker!.tag).toMatch(expectedTag);
    expect(dockerDescriptor.docker!.cmd).toEqual(['echo', 'hello']);
  });
});

function writeTestArtifactInfo(
  i: PackageInfo,
  artifactType: 'docker' | 'archive',
  artifact: artifacts.withId<artifacts.anyType>,
) {
  let artInfoPath: string;
  if (artifactType === 'docker') {
    artInfoPath = i.artifactInfoLocation(artifact.id, 'docker', util.currentArch());
  } else if (artifacts.isCrossPlatform(artifact.type)) {
    artInfoPath = i.artifactInfoLocation(artifact.id, 'archive', undefined);
  } else {
    artInfoPath = i.artifactInfoLocation(artifact.id, 'archive', util.currentPlatform());
  }

  const registry = i.artifactRegistrySettings(artifact);

  writeBuiltArtifactInfo(artInfoPath, {
    type: artifact.type,
    platform: util.currentPlatform(),
    registryURL: artifact.type === 'asset' ? registry.downloadURL : undefined,
    registryName: registry.name,
    remoteArtifactLocation: artifactType === 'docker' ? docker.generateRemoteTagName(i.artifactName(artifact), 'beefface') : i.artifactArchiveAddressPattern(artifact),
    uploadPath: artifactType === 'docker' ? undefined : i.artifactArchiveFullName(artifact, util.currentPlatform()),
  });
}
