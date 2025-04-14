import { newTemplateFromContent, newTemplateFromData, Template } from './template';
import { formatArtefactNameAndVersion, FullArtifactName } from './package';
import { test, expect } from 'vitest';

test('template serialization / deserialization', () => {
  const name: FullArtifactName = {
    type: 'template',
    pkg: '@milaboratory/some-package',
    id: 'the-template',
    version: '1.2.3'
  };
  const template1 = newTemplateFromData(
    'dist',
    name,
    {
      type: 'pl.tengo-template.v3',
      hashToSource: {
        "asdasd": "src1...",
        "asdasd2": "src2...",
        "asdasd3": "src3...",
      },
      template: {
        sourceHash: "asdasd3",
        ...formatArtefactNameAndVersion(name),
        libs: {
          'asdasd': {
            name: '@milaboratory/some-package:the-library',
            version: '1.2.3',
            sourceHash: 'asdasd'
          }
        },
        templates: {
          'asdasd2': {
            name: '@milaboratory/some-package:the-template-1',
            version: '1.2.3',
            libs: {
              '@milaboratory/some-package:the-library:1.2.4': {
                name: '@milaboratory/some-package:the-library',
                version: '1.2.4',
                sourceHash: 'asdasd2'
              }
            },
            templates: {},
            software: {},
            assets: {},
            sourceHash: 'src 1...'
          }
        },
        software: {},
        assets: {},
      },
    }
  );

  const template2 = newTemplateFromContent(
    'dist',
    { type: 'template', pkg: '@milaboratory/some-package', id: 'the-template', version: '1.2.3' },
    template1.content,
  );

  console.log('Size: raw', JSON.stringify(template1.data).length, 'compressed', template1.content.byteLength);

  expect(template2.data).toStrictEqual(template1.data);
});
