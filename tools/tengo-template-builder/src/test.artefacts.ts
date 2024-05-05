import { FullArtefactId } from './package';

export interface TestArtefact {
  id: FullArtefactId;
  src?: string;
  normalizedSrc?: string;
  content?: Uint8Array;
}

/*

 tpl:current-package:local-template-1
   - tpl:current-package:local-template-1 == self
   - lib:current-package:local-library-1
   - lib:package1:other-lib-1

 lib:current-package:local-library-1
   - tpl:package1:local-template-3
   - tpl:current-package:local-template-2
   - lib:package1:other-lib-1

 tpl:current-package:local-template-2
   - lib:package1:other-lib-1

 tpl:package1:template-3
   - package1:other-lib-1

 lib:package1:other-lib-1

 */

export const testLocalLib1Id: FullArtefactId = {
  type: 'library',
  pkg: 'current-package',
  name: 'local-library-1',
  version: '1.2.3'
};
export const testLocalLib1Src = `
otherLib = import("package1:other-lib-1" )
export {
    "some": "value",
    "template2": getTemplate(":local-template-2" ),
    "template3": getTemplate ( "package1:template-3")
}
`;
export const testLocalLib1SrcNormalized = `
otherLib = import("package1:other-lib-1")
export {
    "some": "value",
    "template2": getTemplate(":local-template-2"),
    "template3": getTemplate("package1:template-3")
}
`;

export const testLocalTpl1Id: FullArtefactId = {
  type: 'template',
  pkg: 'current-package',
  name: 'local-template-1',
  version: '1.2.3'
};
export const testLocalTpl1Src = `
lib1 = import( ":local-library-1")
lib2 = import("package1:other-lib-1")
tpl2 = getTemplate(":local-template-1" )
`;
export const testLocalTpl1SrcNormalized = `
lib1 = import(":local-library-1")
lib2 = import("package1:other-lib-1")
tpl2 = getTemplate(":local-template-1")
`;

export const testLocalTpl2Id: FullArtefactId = {
  type: 'template',
  pkg: 'current-package',
  name: 'local-template-2',
  version: '1.2.3'
};
export const testLocalTpl2Src = `
lib = import("package1:other-lib-1")
`;
export const testLocalTpl2SrcNormalized = `
lib = import("package1:other-lib-1")
`;

export const testLocalLib1: TestArtefact = {
  id: testLocalLib1Id,
  src: testLocalLib1Src,
  normalizedSrc: testLocalLib1SrcNormalized
};

export const testLocalTpl1: TestArtefact = {
  id: testLocalTpl1Id,
  src: testLocalTpl1Src,
  normalizedSrc: testLocalTpl1SrcNormalized
};

export const testLocalTpl2: TestArtefact = {
  id: testLocalTpl2Id,
  src: testLocalTpl2Src,
  normalizedSrc: testLocalTpl2SrcNormalized
};

export const testPackage1Lib1Id: FullArtefactId = {
  type: 'library',
  pkg: 'package1',
  name: 'other-lib-1',
  version: '1.2.3'
};
export const testPackage1Lib1Src = `
export {
    "some": "value1"
}
`;
export const testPackage1Lib1SrcNormalized = testPackage1Lib1Src;

export const testPackage1Tpl3Id: FullArtefactId = {
  type: 'library',
  pkg: 'package1',
  name: 'template-3',
  version: '1.2.3'
};
export const testPackage1Tpl3Src = `
lib = import(":other-lib-1")
`;
export const testPackage1Tpl3SrcNormalized = `
lib = import("package1:other-lib-1")
`;

export const testPackage1Lib1: TestArtefact = {
  id: testPackage1Lib1Id,
  src: testPackage1Lib1Src,
  normalizedSrc: testPackage1Lib1SrcNormalized
};

export const testPackage1Tpl3: TestArtefact = {
  id: testPackage1Tpl3Id,
  src: testPackage1Tpl3Src,
  normalizedSrc: testPackage1Tpl3SrcNormalized
};
