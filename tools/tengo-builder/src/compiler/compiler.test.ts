import { TengoTemplateCompiler } from './compiler';
import { ArtifactSource, parseSource } from './source';
import * as winston from 'winston';
import * as ta from './test.artifacts';
import { artifactNameToString } from './package';
import { Template } from './template';
import { createLogger } from './util';

function parseSrc(logger: winston.Logger, src: ta.TestArtifactSource[]): ArtifactSource[] {
  return src.map((tp) => {
    const aSrc = parseSource(logger, 'dist', tp.src, tp.fullName, true);
    return aSrc;
  });
}

test('compile package 1', () => {
  const logger = createLogger('error');

  const compiler = new TengoTemplateCompiler('dist');
  const compiled = compiler.compileAndAdd(parseSrc(logger, ta.testPackage1));
  expect(compiled.templates[0].data.libs).toHaveProperty(
    artifactNameToString(ta.testPackage1Lib1Name)
  );
  console.log(Buffer.from(compiled.templates[0].content).toString('base64'));
});

test('compile main source set', () => {
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
  compiler.addTemplate(
    new Template('dist', ta.testPackage1Tpl3Name, {
      content: Buffer.from(ta.testPackage1Tpl3CompiledBase64, 'base64')
    })
  );

  // all elements in the context must have all their dependencies met
  compiler.checkLibs();

  // main package compilation
  const compiled = compiler.compileAndAdd(parseSrc(logger, ta.testLocalPackage));
  const tpl1 = compiled.templates.find((t) => t.fullName.id === 'local-template-1')!;
  expect(tpl1).toBeDefined();

  // checking that transient library dependency was resolved
  expect(tpl1.data.templates).toHaveProperty('package1:template-3');
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
  expect(tpl3.data.hashOverride).toEqual('CE0F6EDF-D97C-44E7-B16B-D661D4C799C1'.toLowerCase());
  expect(tpl3.data.libs[artifactNameToString(ta.testLocalLib3.fullName)]).toBeDefined();
});

test('wrong hash override value throws error', () => {
  const compiler = new TengoTemplateCompiler('dist');
  const logger = createLogger('error');

  expect(() => compiler.compileAndAdd(parseSrc(logger, ta.testPackage2BrokenHash))).toThrow('must contain valid UUID as an override');
});
