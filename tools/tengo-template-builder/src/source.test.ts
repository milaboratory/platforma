import { parseSource } from './source';
import { FullArtefactId } from './package';
import { testLocalLib1Src, testLocalLib1Id, testLocalLib1SrcNormalized } from './test.artefacts';

test('test lib 1 parsing and normalization', () => {
  const libSrc = parseSource(testLocalLib1Src, testLocalLib1Id, true);
  expect(libSrc.src).toStrictEqual(testLocalLib1SrcNormalized);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'current-package', name: 'local-lib' },
    { type: 'template', pkg: 'current-package', name: 'local-template-2' },
    { type: 'template', pkg: 'package1', name: 'local-template-3' },
    { type: 'template', pkg: 'current-package', name: 'local-template-4' }
  ]);
});

test('test lib 1 parsing, normalization & re-parsing', () => {
  const libSrc = parseSource(testLocalLib1Src, testLocalLib1Id, true);
  const libSrc1 = parseSource(libSrc.src, testLocalLib1Id, false);
  expect(libSrc1.src).toStrictEqual(testLocalLib1SrcNormalized);
  expect(libSrc1.dependencies).toEqual([
    { type: 'library', pkg: 'current-package', name: 'local-lib' },
    { type: 'template', pkg: 'current-package', name: 'local-template-2' },
    { type: 'template', pkg: 'package1', name: 'local-template-3' },
    { type: 'template', pkg: 'current-package', name: 'local-template-4' }
  ]);
});
