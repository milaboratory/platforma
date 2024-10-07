import { TengoTemplateCompiler } from './compiler';
import { ArtifactSource, parseSource } from './source';
import {
  TestArtifactSource,
  testLocalPackage,
  testPackage1,
  testPackage1Lib1Name,
  testPackage1Lib1Src,
  testPackage1Lib2Name,
  testPackage1Lib2Src,
  testPackage1Soft1Name,
  testPackage1Soft1Src,
  testPackage1Tpl3CompiledBase64,
  testPackage1Tpl3Name
} from './test.artifacts';
import { artifactNameToString } from './package';
import { Template } from './template';

function parseSrc(src: TestArtifactSource[]): ArtifactSource[] {
  return src.map((tp) => {
    const aSrc = parseSource('dist', tp.src, tp.fullName, true);
    return aSrc;
  });
}

test('compile package 1', () => {
  const compiler = new TengoTemplateCompiler('dist');
  const compiled = compiler.compileAndAdd(parseSrc(testPackage1));
  expect(compiled.templates[0].data.libs).toHaveProperty(
    artifactNameToString(testPackage1Lib1Name)
  );
  console.log(Buffer.from(compiled.templates[0].content).toString('base64'));
});

test('compile main source set', () => {
  const compiler = new TengoTemplateCompiler('dist');

  // emulate adding compiled artifacts
  compiler.addLib(parseSource('dist', testPackage1Lib1Src, testPackage1Lib1Name, true));
  compiler.addLib(parseSource('dist', testPackage1Lib2Src, testPackage1Lib2Name, true));
  compiler.addSoftware(parseSource('dist', testPackage1Soft1Src, testPackage1Soft1Name, true));
  compiler.addTemplate(
    new Template('dist', testPackage1Tpl3Name, {
      content: Buffer.from(testPackage1Tpl3CompiledBase64, 'base64')
    })
  );

  // all elements in the context must have all their dependencies met
  compiler.checkLibs();

  // main package compilation
  const compiled = compiler.compileAndAdd(parseSrc(testLocalPackage));
  const tpl1 = compiled.templates.find((t) => t.fullName.id === 'local-template-1')!;
  expect(tpl1).toBeDefined();

  // checking that transient library dependency was resolved
  expect(tpl1.data.templates).toHaveProperty('package1:template-3');
});
