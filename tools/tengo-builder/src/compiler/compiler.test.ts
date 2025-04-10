import { TemplatesAndLibs, TengoTemplateCompiler } from './compiler';
import { ArtifactSource, parseSource } from './source';
import * as ta from './test.artifacts';
import { artifactNameToString } from './package';
import { createLogger } from './util';
import { test, expect, describe, it } from 'vitest';
import { MiLogger } from '@milaboratories/ts-helpers';
import type { FullArtifactName, TypedArtifactName } from './package';
import { TemplateDataV3, TemplateLibDataV3 } from '@milaboratories/pl-model-backend';

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
        '2e0d81deae0220df5901292911fd96065be96bc2187debb24bd869b47e1caa77': `
lib := import(\"package1:other-lib-1\")
`,
        '3f850fa4c5f6a8a3017fa883fc03fc2dee159f65e2dbb9c6cd0c6dff0aae6419': `
export {
    \"some\": \"value1\"
}
`,
      },
      template: {
        name: 'package1:template-3',
        version: '1.2.3',
        sourceHash: '2e0d81deae0220df5901292911fd96065be96bc2187debb24bd869b47e1caa77',
        templates: {},
        software: {},
        assets: {},
        libs: {
          'package1:other-lib-1': {
            name: 'package1:other-lib-1',
            version: '1.2.3',
            sourceHash: '3f850fa4c5f6a8a3017fa883fc03fc2dee159f65e2dbb9c6cd0c6dff0aae6419',
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
  compiler.addLib(
    parseSource(logger, 'dist', ta.testPackage1Lib1Src, ta.testPackage1Lib1Name, true)
  );
  compiler.addLib(
    parseSource(logger, 'dist', ta.testPackage1Lib2Src, ta.testPackage1Lib2Name, true)
  );
  compiler.addSoftware(
    parseSource(logger, 'dist', ta.testPackage1Soft1Src, ta.testPackage1Soft1Name, true)
  );

  // FIXME: how to rewrite test to the new template?
  // compiler.addTemplate(
  //   templateToSource(
  //     newTemplateFromContent(
  //       'dist',
  //       ta.testPackage1Tpl3Name,
  //       Buffer.from(ta.testPackage1Tpl3CompiledBase64, 'base64')
  //     ),
  //   )
  // );

  // all elements in the context must have all their dependencies met
  compiler.checkLibs();

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

/** Functions for generating test data. */

const genHash = (nameId: string) => nameId + '-hash';
const genName = (nameId: string) => nameId + '-name';
const genArtifactName = artifactNameToString;

const genArtifactSource = (name: FullArtifactName, src: string, dependencies: TypedArtifactName[]) =>
  new ArtifactSource('dist', name, genHash(name.id), src, genName(name.id), dependencies, []);

const genTemplateData = (name: FullArtifactName, templates: TemplateDataV3[], libs: TemplateLibDataV3[]) => (
  {
    name: genArtifactName(name),
    version: name.version,
    sourceHash: genHash(name.id),
    templates: Object.fromEntries(templates.map(t => [t.name, t])),
    libs: Object.fromEntries(libs.map(l => [l.name, l])),
    software: {},
    assets: {},
  }
);

const genLibData = (name: FullArtifactName) => (
  {
    name: genArtifactName(name),
    version: name.version,
    sourceHash: genHash(name.id),
  }
);

describe('TengoTemplateCompiler.compileAndAdd', () => {
  const testCases: {
    name: string;
    sources: ArtifactSource[];
    expected: TemplatesAndLibs;
  }[] = [
    {
      name: 'should process a single library and pass it as-is',
      sources: [
        genArtifactSource(ta.testLocalLib3Name, ta.testLocalLib3Src, []),
      ],
      expected: {
        libs: [
          genArtifactSource(ta.testLocalLib3Name, ta.testLocalLib3Src, []),
        ],
        templates: [],
        software: [],
        assets: []
      }
    },
    {
      name: 'should process a single software and pass it as-is',
      sources: [
        genArtifactSource(ta.testPackage1Soft1Name, ta.testPackage1Soft1Src, []),
      ],
      expected: {
        libs: [],
        templates: [],
        software: [
          genArtifactSource(ta.testPackage1Soft1Name, ta.testPackage1Soft1Src, []),
        ],
        assets: []
      }
    },
    {
      name: 'should process a single asset and pass it as-is',
      sources: [
        genArtifactSource(ta.testPackage1Asset1Name, ta.testPackage1Asset1Src, []),
      ],
      expected: {
        libs: [],
        templates: [],
        software: [],
        assets: [
          genArtifactSource(ta.testPackage1Asset1Name, ta.testPackage1Asset1Src, []),
        ]
      }
    },
    {
      name: 'should process a template with 1 library dependency',
      sources: [
        genArtifactSource(ta.testLocalTpl2Name, ta.testLocalTpl2Src, [ta.testLocalLib1Name]),
        genArtifactSource(ta.testLocalLib1Name, ta.testLocalLib1Src, []),
      ],
      expected: {
        libs: [
          genArtifactSource(ta.testLocalLib1Name, ta.testLocalLib1Src, []),
        ],
        templates: [
          {
            compileMode: 'dist',
            fullName: ta.testLocalTpl2Name,
            source: ta.testLocalTpl2Src,
            data: {
              type: 'pl.tengo-template.v3',
              hashToSource: {
                [genHash(ta.testLocalLib1Name.id)]: ta.testLocalLib1Src,
                [genHash(ta.testLocalTpl2Name.id)]: ta.testLocalTpl2Src,
              },
              template: genTemplateData(ta.testLocalTpl2Name, [], [
                genLibData(ta.testLocalLib1Name),
              ]),
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
        genArtifactSource(ta.testLocalTpl1Name, ta.testLocalTpl1Src, [ta.testLocalTpl2Name]),
        genArtifactSource(ta.testLocalTpl2Name, ta.testLocalTpl2Src, []),
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
                [genHash(ta.testLocalTpl2Name.id)]: ta.testLocalTpl2Src,
              },
              template: genTemplateData(ta.testLocalTpl2Name, [], []),
            }
          },
          {
            compileMode: 'dist',
            fullName: ta.testLocalTpl1Name,
            source: ta.testLocalTpl1Src,
            data: {
              type: 'pl.tengo-template.v3',
              hashToSource: {
                [genHash(ta.testLocalTpl1Name.id)]: ta.testLocalTpl1Src,
                [genHash(ta.testLocalTpl2Name.id)]: ta.testLocalTpl2Src,
              },
              template: genTemplateData(ta.testLocalTpl1Name, [
                genTemplateData(ta.testLocalTpl2Name, [], []),
              ], []),
            },
          },
        ],
        software: [],
        assets: []
      }
    },
    {
      name: 'should process a template with another template dependency and a nested library dependency',
      sources: [
        genArtifactSource(ta.testLocalTpl1Name, ta.testLocalTpl1Src, [ta.testLocalTpl2Name]),
        genArtifactSource(ta.testLocalTpl2Name, ta.testLocalTpl2Src, [ta.testLocalLib3Name]),
        genArtifactSource(ta.testLocalLib3Name, ta.testLocalLib3Src, []),
      ],
      expected: {
        libs: [
          genArtifactSource(ta.testLocalLib3Name, ta.testLocalLib3Src, []),
        ],
        templates: [
          {
            compileMode: 'dist',
            fullName: ta.testLocalTpl2Name,
            source: ta.testLocalTpl2Src,
            data: {
              type: 'pl.tengo-template.v3',
              hashToSource: {
                [genHash(ta.testLocalTpl2Name.id)]: ta.testLocalTpl2Src,
                [genHash(ta.testLocalLib3Name.id)]: ta.testLocalLib3Src,
              },
              template: genTemplateData(ta.testLocalTpl2Name, [], [
                genLibData(ta.testLocalLib3Name),
              ]),
            },
          },
          {
            compileMode: 'dist',
            fullName: ta.testLocalTpl1Name,
            source: ta.testLocalTpl1Src,
            data: {
              type: 'pl.tengo-template.v3',
              hashToSource: {
                [genHash(ta.testLocalTpl1Name.id)]: ta.testLocalTpl1Src,
                [genHash(ta.testLocalTpl2Name.id)]: ta.testLocalTpl2Src,
                [genHash(ta.testLocalLib3Name.id)]: ta.testLocalLib3Src,
              },
              template: genTemplateData(ta.testLocalTpl1Name, [
                genTemplateData(ta.testLocalTpl2Name, [], [
                  genLibData(ta.testLocalLib3Name),
                ]),
              ], []),
            },
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
      genArtifactSource(ta.testLocalTpl1Name, ta.testLocalTpl1Src, [ta.testLocalLib1Name]),
    ];

    expect(() => compiler.compileAndAdd(sources)).toThrow(/Unsatisfied dependencies/);
  });
});
