import { TemplatesAndLibs, TengoTemplateCompiler } from './compiler';
import { ArtifactSource, parseSource } from './source';
import * as ta from './test.artifacts';
import { artifactNameToString } from './package';
import { newTemplateFromContent, newTemplateFromData, templateToSource } from './template';
import { createLogger } from './util';
import { test, expect, describe, it } from 'vitest';
import { MiLogger } from '@milaboratories/ts-helpers';
import type { FullArtifactName, TypedArtifactName, CompileMode, CompilerOption } from './package';
import { type CompiledTemplateV3 } from '@milaboratories/pl-model-backend';

function parseSrc(logger: MiLogger, src: ta.TestArtifactSource[]): ArtifactSource[] {
  return src.map((tp) => {
    const aSrc = parseSource(logger, 'dist', tp.src, tp.fullName, true);
    return aSrc;
  });
}

test('compile package 1', () => {
  const logger = createLogger('error');

  const compiler = new TengoTemplateCompiler('dist');
  const compiled = compiler.compileAndAdd(parseSrc(logger, ta.testPackage1));

  expect(compiled.templates[0]).toMatchObject({
    data: {
      type: 'pl.tengo-template.v3',
      hashToSource: {
        'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=': `
lib := import(\"package1:other-lib-1\")
`,
        'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=': `
export {
    \"some\": \"value1\"
}
`,
      },
      template: {
        name: 'package1:template-3',
        version: '1.2.3',
        sourceHash: 'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=',
        templates: {},
        software: {},
        assets: {},
        libs: {
          'package1:other-lib-1': {
            name: 'package1:other-lib-1',
            version: '1.2.3',
            sourceHash: 'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=',
          },
        },
      },
    },
  });
});

// FIXME: how to rewrite test to the new template version? It has a strange base64-encoded thing.
test.skip('compile main source set', () => {
  const compiler = new TengoTemplateCompiler('dist');
  const logger = createLogger('error');

  // emulate adding compiled artifacts
  compiler.store.addLib(
    parseSource(logger, 'dist', ta.testPackage1Lib1Src, ta.testPackage1Lib1Name, true)
  );
  compiler.store.addLib(
    parseSource(logger, 'dist', ta.testPackage1Lib2Src, ta.testPackage1Lib2Name, true)
  );
  compiler.store.addSoftware(
    parseSource(logger, 'dist', ta.testPackage1Soft1Src, ta.testPackage1Soft1Name, true)
  );

  // FIXME: how to rewrite test to the new template?
  // compiler.store.addTemplate(
  //   templateToSource(
  //     newTemplateFromContent(
  //       'dist',
  //       ta.testPackage1Tpl3Name,
  //       Buffer.from(ta.testPackage1Tpl3CompiledBase64, 'base64')
  //     ),
  //   )
  // );

  // all elements in the context must have all their dependencies met
  compiler.store.checkLibs();

  // main package compilation
  const compiled = compiler.compileAndAdd(parseSrc(logger, ta.testLocalPackage));
  const tpl1 = compiled.templates.find((t) => t.fullName.id === 'local-template-1')!;
  expect(tpl1).toBeDefined();

  // checking that transient library dependency was resolved
  expect(tpl1.data.template.templates).toHaveProperty('package1:template-3');
});

test('compile template with hash override', () => {
  const compiler = new TengoTemplateCompiler('dist');
  const logger = createLogger('error');

  // main package compilation
  const compiled = compiler.compileAndAdd(parseSrc(logger, ta.testPackage2));
  const tpl3 = compiled.templates.find((t) => t.fullName.id === 'local-template-3')!;
  console.log('Tpl3: ' + JSON.stringify(tpl3));
  expect(tpl3).toBeDefined();

  // checking that transient library dependency was resolved
  expect(tpl3.data.template.hashOverride).toEqual('CE0F6EDF-D97C-44E7-B16B-D661D4C799C1'.toLowerCase());
  expect(tpl3.data.template.libs[artifactNameToString(ta.testLocalLib3.fullName)]).toBeDefined();
});

test('wrong hash override value throws error', () => {
  const compiler = new TengoTemplateCompiler('dist');
  const logger = createLogger('error');

  expect(() => compiler.compileAndAdd(parseSrc(logger, ta.testPackage2BrokenHash))).toThrow('must contain valid UUID as an override');
});

describe('TengoTemplateCompiler.compileAndAdd', () => {
  // Table-driven test cases with expected artifacts rather than just counts
  const testCases: {
    name: string;
    sources: ArtifactSource[];
    expected: TemplatesAndLibs;
  }[] = [
    {
      name: 'should process a single library',
      sources: [
        new ArtifactSource(
          'dist',
          ta.testLocalLib3Name,
          'testhash123',
          ta.testLocalLib3Src,
          'lib1.tengo',
          [],
          []
        ),
      ],
      expected: {
        libs: [
          {
            compileMode: 'dist',
            srcName: 'lib1.tengo',
            fullName: ta.testLocalLib3Name,
            sourceHash: 'testhash123',
            src: ta.testLocalLib3Src,
            dependencies: [],
            compilerOptions: []
          }
        ],
        templates: [],
        software: [],
        assets: []
      }
    },
    {
      name: 'should process a single software',
      sources: [
        new ArtifactSource(
          'dist',
          ta.testPackage1Soft1Name,
          'testhash123',
          ta.testPackage1Soft1Src,
          'sw1.tengo',
          [],
          []
        ),
      ],
      expected: {
        libs: [],
        templates: [],
        software: [
          {
            compileMode: 'dist',
            srcName: 'sw1.tengo',
            fullName: ta.testPackage1Soft1Name,
            sourceHash: 'testhash123',
            src: ta.testPackage1Soft1Src,
            dependencies: [],
            compilerOptions: []
          }
        ],
        assets: []
      }
    },
    {
      name: 'should process a single asset',
      sources: [
        new ArtifactSource(
          'dist',
          ta.testPackage1Asset1Name,
          'testhash123',
          ta.testPackage1Asset1Src,
          'asset1.tengo',
          [],
          []
        ),
      ],
      expected: {
        libs: [],
        templates: [],
        software: [],
        assets: [
          {
            compileMode: 'dist',
            srcName: 'asset1.tengo',
            fullName: ta.testPackage1Asset1Name,
            sourceHash: 'testhash123',
            src: ta.testPackage1Asset1Src,
            dependencies: [],
            compilerOptions: []
          }
        ]
      }
    },
    {
      name: 'should process a template with 1 library dependency',
      sources: [
        new ArtifactSource(
          'dist',
          ta.testLocalTpl2Name,
          'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=',
          ta.testLocalTpl2Src,
          'tpl2.tengo',
          [ta.testLocalLib1Name],
          []
        ),
        new ArtifactSource(
          'dist',
          ta.testLocalLib1Name,
          'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=',
          ta.testLocalLib1Src,
          'lib1.tengo',
          [],
          []
        ),
      ],
      expected: {
        libs: [
          {
            compileMode: 'dist',
            srcName: 'lib1.tengo',
            fullName: ta.testLocalLib1Name,
            sourceHash: 'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=',
            src: ta.testLocalLib1Src,
            dependencies: [],
            compilerOptions: []
          }
        ],
        templates: [
          {
            compileMode: 'dist',
            fullName: ta.testLocalTpl2Name,
            source: ta.testLocalTpl2Src,
            data: {
              type: 'pl.tengo-template.v3',
              hashToSource: {
                'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=': ta.testLocalTpl2Src,
                'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=': ta.testLocalLib1Src,
              },
              template: {
                name: `current-package:local-template-2`,
                version: ta.testLocalTpl2Name.version,
                sourceHash: 'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=',
                templates: {},
                software: {},
                assets: {},
                libs: {
                  'current-package:local-library-1': {
                    name: 'current-package:local-library-1',
                    version: '1.2.3',
                    sourceHash: 'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=',
                  }
                }
              }
            },
          }
        ],
        software: [],
        assets: []
      }
    },
    {
      name: 'should process a template with another template dependency',
      sources: [
        new ArtifactSource(
          'dist',
          ta.testLocalTpl1Name,
          'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=',
          ta.testLocalTpl1Src,
          'tpl1.tengo',
          [ta.testLocalTpl2Name],
          []
        ),
        new ArtifactSource(
          'dist',
          ta.testLocalTpl2Name,
          'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=',
          ta.testLocalTpl2Src,
          'tpl2.tengo',
          [],
          []
        ),
      ],
      expected: {
        libs: [],
        templates: [
          {
            compileMode: 'dist',
            fullName: ta.testLocalTpl2Name,
            source: ta.testLocalTpl2Src,
            data: {
              type: 'pl.tengo-template.v3',
              hashToSource: {
                'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=': ta.testLocalTpl2Src,
              },
              template: {
                name: `current-package:local-template-2`,
                version: ta.testLocalTpl2Name.version,
                sourceHash: 'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=',
                templates: {},
                software: {},
                assets: {},
                libs: {},
              },
            }
          },
          {
            compileMode: 'dist',
            fullName: ta.testLocalTpl1Name,
            source: ta.testLocalTpl1Src,
            data: {
              type: 'pl.tengo-template.v3',
              hashToSource: {
                'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=': ta.testLocalTpl1Src,
                'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=': ta.testLocalTpl2Src,
              },
              template: {
                name: `current-package:local-template-1`,
                version: ta.testLocalTpl1Name.version,
                sourceHash: 'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=',
                templates: {
                  'current-package:local-template-2': {
                    name: 'current-package:local-template-2',
                    version: ta.testLocalTpl2Name.version,
                    sourceHash: 'P4UPpMX2qKMBf6iD/AP8Le4Vn2Xi27nGzQxt/wquZBk=',
                    templates: {},
                    software: {},
                    assets: {},
                    libs: {},
                  }
                },
                software: {},
                assets: {},
                libs: {},
              },
            }
          },
        ],
        software: [],
        assets: []
      }
    },
  ];

  // Execute all test cases
  testCases.forEach(tc => {
    it(tc.name, () => {
      const compiler = new TengoTemplateCompiler('dist');
            
      const result = compiler.compileAndAdd(tc.sources);
      
      expect(result).toMatchObject(tc.expected);
    });
  });

  it('should throw error for unresolvable dependencies', () => {
    const compiler = new TengoTemplateCompiler('dist');
    
    const sources = [
      new ArtifactSource(
        'dist',
        ta.testLocalTpl1Name,
        'Lg2B3q4CIN9ZASkpEf2WBlvpa8IYfeuyS9hptH4cqnc=',
        ta.testLocalTpl1Src,
        'tpl1.tengo',
        [ta.testLocalLib1Name],
        []
      ),    
    ];
    
    expect(() => compiler.compileAndAdd(sources)).toThrow(/Unsatisfied dependencies/);
  });
});
