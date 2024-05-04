import { parseSource } from './source';

const lib1 = `
export {
    "some": "value",
    "template2": getTemplate(":local-template-2")
}
`;

const tpl1 = `
thelib = import(":local-lib")
tpl1 = getTemplate(":local-template-1")
tpl2 = getTemplate("the-package:template-123")
`;


test('test lib 1', () => {
  const libSorce = parseSource(lib1, {
    type: 'library',
    pkg: 'current-package',
    name: 'current-library',
    version: '1.2.3'
  });
  console.log(libSorce)
});
