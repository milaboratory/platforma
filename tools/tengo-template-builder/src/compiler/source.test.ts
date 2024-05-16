import { parseSource } from './source';
import { testLocalLib1Src, testLocalLib1Name, testLocalLib2Src } from './test.artifacts';

test('test lib 1 parsing', () => {
  const libSrc = parseSource(testLocalLib1Src, testLocalLib1Name);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'other-lib-2' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' },
    { type: 'template', pkg: 'package1', id: 'template-3' }
  ]);
});

test('test lib 2 parsing', () => {
  const libSrc = parseSource(testLocalLib2Src, testLocalLib1Name);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'someid' },
    { type: 'template', pkg: 'package2', id: 'template-1' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' }
  ]);
});
