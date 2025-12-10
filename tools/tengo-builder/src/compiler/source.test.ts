import { 
  newGetSoftwareInfoRE,
  newGetTemplateIdRE,
  parseSource,
  sourceParserContext,
  lineProcessingResult,
} from './source';
import { createLogger } from './util';
import {
  testLocalLib1Name,
  testLocalLib1Src,
  testLocalLib1SrcNormalized,
  testLocalLib2Name,
  testLocalLib2Src,
  testLocalLib2SrcNormalized,
  testLocalTpl3Src,
  testLocalTpl3Name,
  testTrickyCasesSrc,
  testTrickyCasesNormalized,
} from './test.artifacts';
import { parseSingleSourceLine } from './source';
import { FullArtifactName } from './package';
import { expect, describe, test } from 'vitest';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';

const stubTplName: FullArtifactName = {
  type: 'template',
  pkg: 'stub-pkg',
  id: 'stub-name',
  version: '1.2.3',
};

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
  expect(libSrc.src).toEqual(testLocalLib2SrcNormalized);
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

describe('import statements', () => {
  test('dot multiline works', () => {
    const logger = createLogger('error');

    const multilineImport = `
      importer := import("@platforma-sdk/workflow-tengo:assets")
      importer.
        importSoftware("my:software") // works well
    `

    const parsed = parseSource(logger, 'dist', multilineImport, stubTplName, true);

    let softwareFound = false
    for (const dep of parsed.dependencies) {
      softwareFound = softwareFound || `${dep.type}:${dep.pkg}:${dep.id}` == 'software:my:software';
    }

    expect(softwareFound).toBe(true);
  })

  test('bracket multiline is forbidden', () => {
    // This is
    const logger = createLogger('info');

    const multilineImport = `
      importer := import("@platforma-sdk/workflow-tengo:assets")
      importer.
        importSoftware(
          "my:software"
        ) // does not work for now
    `

    expect(() => parseSource(logger, 'dist', multilineImport, stubTplName, true)).toThrow('in the same line with brackets');
  })

  test('variable import is not allowed', () => {
    const logger = createLogger('info');

    const importByVariable = `
      importer := import("@platforma-sdk/workflow-tengo:assets")
      softwareID := "my:software"
      importer.importSoftware(softwareID) // breaks because of variable reference. We require literals.
    `

    expect(() => parseSource(logger, 'dist', importByVariable, stubTplName, true)).toThrow('variables are not allowed');
  })

  test('test tricky cases parsing', () => {
    const logger = createLogger('error');

    const trickyCasesSrc = parseSource(logger, 'dist', testTrickyCasesSrc, stubTplName, true);
    expect(trickyCasesSrc.src).toEqual(testTrickyCasesNormalized);
  })
})

describe('parseSingleSourceLine', () => {
  const testCases: {
    name: string;
    line: string;
    context: sourceParserContext;
    localPackageName: string;
    globalizeImports?: boolean;
    expected: lineProcessingResult;
  }[] = [

    {
      name: 'empty line',
      line: '   ',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: '   ',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: true,
          canDetectOptions: true,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: true,
          canDetectOptions: true,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: '',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
        }
      }
    },
    {
      name: 'comment-like lines are safe',
      line: 'cmd.saveFile("results/*")',
      context: {
        isInCommentBlock: false,
        canDetectOptions: false,
        lineNo: 100,
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: 'cmd.saveFile("results/*")',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 100,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: '//tengo:nocheck',
        artifacts: [],
        option: { name: 'nocheck', args: [] },
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: 'const x = 5',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: '// tengo:nocheck',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: true,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
        },
      },
    },
    {
      name: 'regular import',
      line: 'fmt := import("fmt")',
      context: {
        isInCommentBlock: false,
        canDetectOptions: true,
        lineNo: 1,
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: 'fmt := import("fmt")',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: 'myLib := import("test-package:myLib")',
        artifacts: [{ pkg: 'test-package', id: 'myLib', type: 'library' }],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      globalizeImports: true,
      expected: {
        line: 'myLib := import("test-package:myLib")',
        artifacts: [{ pkg: 'test-package', id: 'myLib', type: 'library' }],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          artifactImportREs: new Map(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: 'plapi := import("plapi")',
        artifacts: [],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          artifactImportREs: (() => {
            const r = new Map();
            r.set('template', newGetTemplateIdRE('plapi'));
            r.set('software', newGetSoftwareInfoRE('plapi'));
            return r;
          })(),
          importLikeREs: new Map(),
          multilineStatement: '',
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
        artifactImportREs: new Map(),
        importLikeREs: new Map(),
        multilineStatement: '',
      },
      localPackageName: 'test-package',
      expected: {
        line: 'll := import("@milaboratory/tengo-sdk:ll")',
        artifacts: [{
          id: 'll',
          pkg: '@milaboratory/tengo-sdk',
          type: 'library',
        }],
        option: undefined,
        context: {
          isInCommentBlock: false,
          canDetectOptions: false,
          lineNo: 1,
          artifactImportREs: (() => {
            const r = new Map();
            r.set('template', newGetTemplateIdRE('ll'));
            r.set('software', newGetSoftwareInfoRE('ll'));
            return r;
          })(),
          importLikeREs: new Map(),
          multilineStatement: '',
        }
      },
    }
  ]
  test.each(testCases)('$name', ({ line, context, localPackageName, globalizeImports, expected }) => {
    const result = parseSingleSourceLine(
      new ConsoleLoggerAdapter(),
      line,
      context,
      localPackageName,
      globalizeImports,
    );

    expect(result.line).toBe(expected.line);
    expect(result.artifacts).toEqual(expected.artifacts);
    expect(result.option).toEqual(expected.option);
    expect(result.context).toMatchObject(context);
  });
});
