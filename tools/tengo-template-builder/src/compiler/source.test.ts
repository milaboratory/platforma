import { parseSource } from './source';
import { testLocalLib1Src, testLocalLib1Name, testLocalLib2Src, testLocalLib1SrcNormalized } from './test.artifacts';

test('test lib 1 parsing', () => {
  const libSrc = parseSource(testLocalLib1Src, testLocalLib1Name, true);
  expect(libSrc.src).toEqual(testLocalLib1SrcNormalized)
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'other-lib-2' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' },
    { type: 'template', pkg: 'package1', id: 'template-3' }
  ]);

  expect(
    parseSource(testLocalLib1Src, testLocalLib1Name, false).src
  ).toEqual(testLocalLib1Src)
});

test('test lib 2 parsing', () => {
  const libSrc = parseSource(testLocalLib2Src, testLocalLib1Name, true);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'someid' },
    { type: 'library', pkg: '@milaboratory/tengo-sdk', id: 'll' },
    { type: 'template', pkg: 'package2', id: 'template-1' },
    { type: 'software', pkg: 'package2', id: 'software-1' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' },
  ]);
});
