import { FullArtifactName } from './package';

export interface TestArtifactSource {
  fullName: FullArtifactName;
  src: string;
}

/*

 tpl:current-package:local-template-1
   - tpl:current-package:local-template-1 == self
   - lib:current-package:local-library-1
   - lib:package1:other-lib-1

 lib:current-package:local-library-1
   - tpl:package1:template-3
   - tpl:current-package:local-template-2
   - lib:package1:other-lib-2

 tpl:current-package:local-template-2
   - lib:package1:other-lib-1

 tpl:package1:template-3
   - package1:other-lib-1

 lib:package1:other-lib-1

 lib:package1:other-lib-2
  - lib:package1:other-lib-1
  - tpl:package1:template-3

 */

export const testLocalLib1Name: FullArtifactName = {
  type: 'library',
  pkg: 'current-package',
  id: 'local-library-1',
  version: '1.2.3'
};
export const testLocalLib1Src = `
otherLib := import("package1:other-lib-2" )
plapiCustomName := import("plapi")

notplapiCustomName.getTemplateId("some other:parameter")

plapiCustomName.getTemplateIdAnother("sss:kkk")

export {
    "some": "value",
    "template2": plapiCustomName.getTemplateId("current-package:local-template-2" ),
    "template3": plapiCustomName.getTemplateId ( "package1:template-3")
}
`;
export const testLocalLib2Src = `
otherLib := import("package1:someid")
plapi := import("plapi")

tplID := plapi.getTemplateId("package2:template-1")

export {
    "some": "value",
    "template1": plapi.getTemplateId("current-package:local-template-2"),
    "template2": tplID,
}
`;

export const testLocalTpl1Name: FullArtifactName = {
  type: 'template',
  pkg: 'current-package',
  id: 'local-template-1',
  version: '1.2.3'
};
export const testLocalTpl1Src = `
lib1 := import( "current-package:local-library-1")
lib2 := import("package1:other-lib-1")
plapi := import("plapi")

tpl2 := plapi.getTemplateId("current-package:local-template-1" )
`;

export const testLocalTpl2Name: FullArtifactName = {
  type: 'template',
  pkg: 'current-package',
  id: 'local-template-2',
  version: '1.2.3'
};
export const testLocalTpl2Src = `
lib := import("package1:other-lib-1")
`;
export const testLocalTpl2SrcNormalized = `
lib := import("package1:other-lib-1")
`;

export const testLocalLib1: TestArtifactSource = {
  fullName: testLocalLib1Name,
  src: testLocalLib1Src,
};

export const testLocalTpl1: TestArtifactSource = {
  fullName: testLocalTpl1Name,
  src: testLocalTpl1Src,
};

export const testLocalTpl2: TestArtifactSource = {
  fullName: testLocalTpl2Name,
  src: testLocalTpl2Src,
};

export const testLocalPackage = [testLocalTpl1, testLocalLib1, testLocalTpl2];

export const testPackage1Lib1Name: FullArtifactName = {
  type: 'library',
  pkg: 'package1',
  id: 'other-lib-1',
  version: '1.2.3'
};
export const testPackage1Lib1Src = `
export {
    "some": "value1"
}
`;

export const testPackage1Lib2Name: FullArtifactName = {
  type: 'library',
  pkg: 'package1',
  id: 'other-lib-2',
  version: '1.2.3'
};
export const testPackage1Lib2Src = `
lib := import("package1:other-lib-1")
export {
    "some": "value123",
    "theTpl": getTemplateId("package1:template-3")
}
`;

export const testPackage1Tpl3Name: FullArtifactName = {
  type: 'template',
  pkg: 'package1',
  id: 'template-3',
  version: '1.2.3'
};
export const testPackage1Tpl3Src = `
lib := import("package1:other-lib-1")
`;

export const testPackage1Tpl3CompiledBase64 = 'H4sIAAAAAAAAE22PQQqDMBREr/KZVQsxELsL9CZ/E+VjQ2MiJpUWyd2LglCo2xlm3syK4LsMu2Jy/dMNYmwqD5mb4LvGbHp0o8Ce2wp57mHBUd5TmgutHImIGDmNwrDEWFx4iWFwrByhsMicfYqwMLrVN9Sq/hhFxim4Is3tBxF8R3fy4wa68OkgxnVnHPntWFUon2mvD7pIHFJz2HppzwZ9AanB7OAUAQAA';

export const testPackage1Lib1: TestArtifactSource = {
  fullName: testPackage1Lib1Name,
  src: testPackage1Lib1Src,
};

export const testPackage1Lib2: TestArtifactSource = {
  fullName: testPackage1Lib2Name,
  src: testPackage1Lib2Src,
};

export const testPackage1Tpl3: TestArtifactSource = {
  fullName: testPackage1Tpl3Name,
  src: testPackage1Tpl3Src,
};

export const testPackage1 = [testPackage1Lib1, testPackage1Lib2, testPackage1Tpl3];
