import { TengoTemplateCompiler } from './compiler';
import { ArtifactSource, parseSource } from './source';
import * as winston from 'winston';
import {
  TestArtifactSource, testLocalPackage,
  testLocalTpl3,
  testLocalTpl3Name,
  testLocalTpl3Src,
  testPackage1,
  testPackage1Lib1Name,
  testPackage1Lib1Src, testPackage1Lib2Name, testPackage1Lib2Src,
  testPackage1Soft1Name,
  testPackage1Soft1Src,
  testPackage1Tpl3CompiledBase64, testPackage1Tpl3Name
} from './test.artifacts';
import { artifactNameToString } from './package';
import { Template } from './template';
import { createLogger } from './util';

function parseSrc(logger: winston.Logger, src: TestArtifactSource[]): ArtifactSource[] {
  return src.map(tp => {
    const aSrc = parseSource(logger, 'dist', tp.src, tp.fullName, true);
    return aSrc;
  });
}

test('compile package 1', () => {
  const logger = createLogger('error')

  const compiler = new TengoTemplateCompiler('dist');
  const compiled = compiler.compileAndAdd(parseSrc(logger, testPackage1));
  expect(compiled.templates[0].data.libs).toHaveProperty(artifactNameToString(testPackage1Lib1Name));
  console.log(Buffer.from(compiled.templates[0].content).toString('base64'));
});

test('compile main source set', () => {
  const compiler = new TengoTemplateCompiler('dist');
  const logger = createLogger('error')

  // emulate adding compiled artifacts
  compiler.addLib(parseSource(logger, 'dist', testPackage1Lib1Src, testPackage1Lib1Name, true));
  compiler.addLib(parseSource(logger, 'dist', testPackage1Lib2Src, testPackage1Lib2Name, true));
  compiler.addSoftware(parseSource(logger, 'dist', testPackage1Soft1Src, testPackage1Soft1Name, true));
  compiler.addTemplate(new Template('dist', testPackage1Tpl3Name, { content: Buffer.from(testPackage1Tpl3CompiledBase64, 'base64') }));

  // all elements in the context must have all their dependencies met
  compiler.checkLibs();

  // main package compilation
  const compiled = compiler.compileAndAdd(parseSrc(logger, testLocalPackage));
  const tpl1 = compiled.templates.find(t => t.fullName.id === 'local-template-1')!;
  expect(tpl1).toBeDefined();

  // checking that transient library dependency was resolved
  expect(tpl1.data.templates).toHaveProperty('package1:template-3');
});

test('compile template with hash override', () => {
  const compiler = new TengoTemplateCompiler('dist');
  const logger = createLogger('error')

  // main package compilation
  const compiled = compiler.compileAndAdd(parseSrc(logger, [testLocalTpl3]));
  const tpl3 = compiled.templates.find(t => t.fullName.id === 'local-template-3')!;
  expect(tpl3).toBeDefined();

  // checking that transient library dependency was resolved
  expect(tpl3.data.hash).toEqual('CE0F6EDF-D97C-44E7-B16B-D661D4C799C1'.toLowerCase())
});
