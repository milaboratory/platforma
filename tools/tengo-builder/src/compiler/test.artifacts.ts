import type { FullArtifactName } from './package';

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
  version: '1.2.3',
};
export const testLocalLib1Src = `
otherLib := import("package1:other-lib-2" )
plapiCustomName := import("plapi" )

notplapiCustomName.getTemplateId( "some other:parameter")

plapiCustomName.getTemplateIdAnother("sss:kkk" )
plapiCustomName.getSoftwareInfo(":software-1")

export {
    "some": "value",
    "template2": plapiCustomName.getTemplateId(":local-template-2" ),
    "template3": plapiCustomName.getTemplateId ( "package1:template-3")
}
`;
export const testLocalLib1SrcNormalized = `
otherLib := import("package1:other-lib-2")
plapiCustomName := import("plapi" )

notplapiCustomName.getTemplateId( "some other:parameter")

plapiCustomName.getTemplateIdAnother("sss:kkk" )
plapiCustomName.getSoftwareInfo("current-package:software-1")

export {
    "some": "value",
    "template2": plapiCustomName.getTemplateId("current-package:local-template-2"),
    "template3": plapiCustomName.getTemplateId("package1:template-3")
}
`;

export const testLocalLib2Name: FullArtifactName = {
  type: 'library',
  pkg: 'current-package',
  id: 'local-library-2',
  version: '2.3.4',
};
export const testLocalLib2Src = `
otherLib := import("package1:someid")
ll := import("@platforma-sdk/workflow-tengo:assets")

/* multiline comments should be ignored
  a := import(":non-existent-library")
 */

tplID := ll.importTemplate("package2:template-1")
softwareID := ll.importSoftware("package2:software-1")
assetID := ll.importAsset("package2:asset-1")

export {
    "some": "value",
    "template1": ll.importTemplate("current-package:local-template-2"),
    "template2": tplID,
}
`;

export const testLocalLib3Name: FullArtifactName = {
  type: 'library',
  pkg: 'current-package',
  id: 'local-library-3',
  version: '6.6.6',
};
export const testLocalLib3Src = `
export {
    "some": "value"
}
`;

export const testLocalTpl1Name: FullArtifactName = {
  type: 'template',
  pkg: 'current-package',
  id: 'local-template-1',
  version: '1.2.3',
};
export const testLocalTpl1Src = `
lib1 := import( ":local-library-1")
lib2 := import("package1:other-lib-1")
plapi := import("plapi")

tpl2 := plapi.getTemplateId("current-package:local-template-1" )
`;

export const testLocalTpl2Name: FullArtifactName = {
  type: 'template',
  pkg: 'current-package',
  id: 'local-template-2',
  version: '1.2.3',
};
export const testLocalTpl2Src = `
lib := import("package1:other-lib-1")
`;
export const testLocalTpl2SrcNormalized = `
lib := import("package1:other-lib-1")
`;

export const testLocalTpl3Name: FullArtifactName = {
  type: 'template',
  pkg: 'current-package',
  id: 'local-template-3',
  version: '1.2.3',
};

export const testLocalTpl3Src = `
//tengo:hash_override CE0F6EDF-D97C-44E7-B16B-D661D4C799C1

a := "some instruction"
lib := import(":local-library-3")
`;

export const testLocalTpl3SrcWrongOverride = `
//tengo:hash_override broken-hash-override

a := "some instruction"
lib := import(":local-library-3")
`;

export const testLocalLib1: TestArtifactSource = {
  fullName: testLocalLib1Name,
  src: testLocalLib1Src,
};

export const testLocalLib3: TestArtifactSource = {
  fullName: testLocalLib3Name,
  src: testLocalLib3Src,
};

export const testLocalTpl1: TestArtifactSource = {
  fullName: testLocalTpl1Name,
  src: testLocalTpl1Src,
};

export const testLocalTpl2: TestArtifactSource = {
  fullName: testLocalTpl2Name,
  src: testLocalTpl2Src,
};

export const testLocalTpl3: TestArtifactSource = {
  fullName: testLocalTpl3Name,
  src: testLocalTpl3Src,
};

export const testLocalPackage = [testLocalTpl1, testLocalLib1, testLocalTpl2];

export const testPackage1Lib1Name: FullArtifactName = {
  type: 'library',
  pkg: 'package1',
  id: 'other-lib-1',
  version: '1.2.3',
};
export const testPackage1Lib1Src = `
export {
    "some": "value1"
}
`;

export const testPackage1Soft1Name: FullArtifactName = {
  type: 'software',
  pkg: 'current-package',
  id: 'software-1',
  version: '1.2.3',
};
export const testPackage1Soft1Src = `
some software contents. Template builder should pass it 'as-is'
`;

export const testPackage1Asset1Name: FullArtifactName = {
  type: 'asset',
  pkg: 'current-package',
  id: 'asset-1',
  version: '1.2.3',
};
export const testPackage1Asset1Src = `
some asset contents. Template builder should pass it 'as-is'
`;

export const testPackage1Lib2Name: FullArtifactName = {
  type: 'library',
  pkg: 'package1',
  id: 'other-lib-2',
  version: '1.2.3',
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
  version: '1.2.3',
};
export const testPackage1Tpl3Src = `
lib := import("package1:other-lib-1")
`;

export const testPackage1Tpl3CompiledBase64
  = 'H4sIAAAAAAAAE22PQQqDMBREr/KZVQsxELsL9CZ/E+VjQ2MiJpUWyd2LglCo2xlm3syK4LsMu2Jy/dMNYmwqD5mb4LvGbHp0o8Ce2wp57mHBUd5TmgutHImIGDmNwrDEWFx4iWFwrByhsMicfYqwMLrVN9Sq/hhFxim4Is3tBxF8R3fy4wa68OkgxnVnHPntWFUon2mvD7pIHFJz2HppzwZ9AanB7OAUAQAA';

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

export const testPackage1: TestArtifactSource[] = [
  testPackage1Lib1,
  testPackage1Lib2,
  testPackage1Tpl3,
];

export const testPackage2: TestArtifactSource[] = [testLocalLib3, testLocalTpl3];

export const testPackage2BrokenHash: TestArtifactSource[] = [
  testLocalLib3,
  {
    fullName: testLocalTpl3Name,
    src: testLocalTpl3SrcWrongOverride,
  },
];
