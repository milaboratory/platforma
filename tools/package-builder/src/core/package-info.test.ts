import { PackageInfo } from './package-info';
import * as artifacts from './test-artifacts';
import { createLogger } from './util';
import { test, expect } from 'vitest';

test('PackageInfo loads correctly for multi-package', () => {
  const l = createLogger('error');

  const i = new PackageInfo(l, {
    pkgJsonData: artifacts.PackageJson,
  });

  let pkg = i.getPackage(artifacts.EPNameAsset);
  expect(pkg.registry.name).toEqual(artifacts.BinaryRegistry);
  expect(pkg.name).toEqual(artifacts.PackageNameNoAt + '/pAsset');
  expect(pkg.version).toEqual(artifacts.PackageVersion);
  expect(pkg.root).toEqual('./src');

  pkg = i.getPackage(artifacts.EPNameCustomName);
  expect(pkg.registry.name).toEqual(artifacts.BinaryRegistry);
  expect(pkg.name).toEqual(artifacts.BinaryCustomName1);
  expect(pkg.version).toEqual(artifacts.BinaryCustomVersion);

  pkg = i.getPackage(artifacts.EPNameJavaEnvironment);
  expect(pkg.registry.name).toEqual(artifacts.BinaryRegistry);
  expect(pkg.name).toEqual(artifacts.PackageNameNoAt + '/' + artifacts.EPNameJavaEnvironment);
  expect(pkg.version).toEqual(artifacts.PackageVersion);
});

test('Limited list of supported platforms', () => {
  const l = createLogger('error');

  const i = new PackageInfo(l, {
    pkgJsonData: artifacts.PackageJson,
  });

  const pkg = i.getPackage(artifacts.EPNameMultiRootBinary);
  expect(pkg.platforms).toEqual(['linux-x64', 'macosx-aarch64']);
});

test('PackageInfo considers version override', () => {
  const l = createLogger('error');

  const i = new PackageInfo(l, {
    pkgJsonData: artifacts.PackageJson,
  });

  const customVersion = 'my-custom-version';
  i.version = customVersion;

  let pkg = i.getPackage('pAsset');
  expect(pkg.version).toEqual(customVersion);

  pkg = i.getPackage(artifacts.EPNameCustomName);
  expect(pkg.version).toEqual(customVersion);

  pkg = i.getPackage(artifacts.EPNameJavaEnvironment);
  expect(pkg.version).toEqual(customVersion);

  pkg = i.getPackage(artifacts.EPNameJava);
  expect(pkg.version).toEqual(customVersion);
});
