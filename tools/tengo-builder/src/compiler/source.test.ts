import { parseSource } from './source';
import { createLogger } from './util';
import {
  testLocalLib1Name,
  testLocalLib1Src,
  testLocalLib2Name,
  testLocalLib2Src,
  testLocalLib1SrcNormalized,
  testLocalTpl3Src,
  testLocalTpl3Name
} from './test.artifacts';

test('test lib 1 parsing', () => {
  const logger = createLogger('error');

  const libSrc = parseSource(logger, 'dist', testLocalLib1Src, testLocalLib1Name, true);
  expect(libSrc.src).toEqual(testLocalLib1SrcNormalized);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'other-lib-2' },
    { type: 'software', pkg: 'current-package', id: 'software-1' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' },
    { type: 'template', pkg: 'package1', id: 'template-3' }
  ]);

  expect(parseSource(logger, 'dist', testLocalLib1Src, testLocalLib1Name, false).src).toEqual(
    testLocalLib1Src
  );
});

test('test lib 2 parsing', () => {
  const logger = createLogger('error');

  const libSrc = parseSource(logger, 'dist', testLocalLib2Src, testLocalLib2Name, true);
  expect(libSrc.dependencies).toEqual([
    { type: 'library', pkg: 'package1', id: 'someid' },
    { type: 'library', pkg: '@platforma-sdk/workflow-tengo', id: 'assets' },
    { type: 'template', pkg: 'package2', id: 'template-1' },
    { type: 'software', pkg: 'package2', id: 'software-1' },
    { type: 'asset', pkg: 'package2', id: 'asset-1' },
    { type: 'template', pkg: 'current-package', id: 'local-template-2' }
  ]);
});

test('test tpl 3 parsing', () => {
  const logger = createLogger('error');

  const tplSrc = parseSource(logger, 'dist', testLocalTpl3Src, testLocalTpl3Name, true);
  expect(tplSrc.compilerOptions[0].name).toEqual('hash_override');
});
