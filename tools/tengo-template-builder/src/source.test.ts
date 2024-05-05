import { parseSource } from './source';
import { testLocalLib1Src, testLocalLib1Name, testLocalLib1SrcNormalized } from './test.artifacts';

test('test lib 1 parsing and normalization', () => {
  const libSrc = parseSource(testLocalLib1Src, testLocalLib1Name, true);
  expect(libSrc.src).toStrictEqual(testLocalLib1SrcNormalized);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'other-lib-2' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' },
    { type: 'template', pkg: 'package1', id: 'template-3' }
  ]);
});

test('test lib 1 parsing, normalization & re-parsing', () => {
  const libSrc = parseSource(testLocalLib1Src, testLocalLib1Name, true);
  const libSrc1 = parseSource(libSrc.src, testLocalLib1Name, false);
  expect(libSrc1.src).toStrictEqual(testLocalLib1SrcNormalized);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'other-lib-2' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' },
    { type: 'template', pkg: 'package1', id: 'template-3' }
  ]);
});
