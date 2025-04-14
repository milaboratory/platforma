import { newGetSoftwareInfoRE, newGetTemplateIdRE, parseSource } from './source';
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
import { parseSingleSourceLine } from './source';
import { expect, describe, test } from 'vitest';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';

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

describe('parseSingleSourceLine', () => {
  test.each([
    {
      name: 'empty line',
      line: '   ',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: '   ',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'single-line comment',
      line: '// This is a comment',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'start of multi-line comment',
      line: '/* Start comment',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: true,
          canDetectOptions: true,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'line inside comment block',
      line: 'This is inside a comment block',
      context: {
        isInCommentBlock: true,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: true,
          canDetectOptions: true,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'end of multi-line comment',
      line: 'End of comment */',
      context: {
        isInCommentBlock: true,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'compiler option',
      line: '//tengo:nocheck',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: '//tengo:nocheck',
        artifact: undefined,
        option: { name: 'nocheck', args: [] },
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'regular code disables canDetectOptions',
      line: 'const x = 5',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: 'const x = 5',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'malformed compiler option warning',
      line: '// tengo:nocheck',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: '// tengo:nocheck',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          tplDepREs: new Map()
        },
        warning: true
      }
    },
    {
      name: 'regular import',
      line: 'fmt := import("fmt")',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: 'fmt := import("fmt")',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'library import',
      line: 'myLib := import("test-package:myLib")',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: 'myLib := import("test-package:myLib")',
        artifact: { pkg: 'test-package', id: 'myLib', type: 'library' },
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'library import with globalize',
      line: 'myLib := import("test-package:myLib")',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      globalizeImports: true,
      expected: {
        line: 'myLib := import("test-package:myLib")',
        artifact: { pkg: 'test-package', id: 'myLib', type: 'library' },
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          tplDepREs: new Map()
        }
      }
    },
    {
      name: 'plapi import sets up template detection',
      line: 'plapi := import("plapi")',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: 'plapi := import("plapi")',
        artifact: undefined,
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          tplDepREs: (() => {
            const r = new Map();
            r.set('template', newGetTemplateIdRE('plapi'));
            r.set('software', newGetSoftwareInfoRE('plapi'));
            return r;
          })(),
        }
      }
    },
    {
      name: 'tengo-sdk:ll import sets up template detection',
      line: 'll := import("@milaboratory/tengo-sdk:ll")',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        tplDepREs: new Map()
      },
      localPackageName: 'test-package',
      expected: {
        line: 'll := import("@milaboratory/tengo-sdk:ll")',
        artifact: {
          id: 'll',
          pkg: '@milaboratory/tengo-sdk',
          type: 'library',
        },
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          tplDepREs: (() => {
            const r = new Map();
            r.set('template', newGetTemplateIdRE('ll'));
            r.set('software', newGetSoftwareInfoRE('ll'));
            return r;
          })()
        }
      }
    }
  ])('$name', ({ line, context, localPackageName, globalizeImports, expected }) => {
    const result = parseSingleSourceLine(
      new ConsoleLoggerAdapter(),
      line,
      context,
      localPackageName,
      globalizeImports,
    );

    expect(result.line).toBe(expected.line);
    expect(result.artifact).toEqual(expected.artifact);
    expect(result.option).toEqual(expected.option);
    expect(result.context).toMatchObject(context);
  });
});
