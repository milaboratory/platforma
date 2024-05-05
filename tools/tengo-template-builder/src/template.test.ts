import { Template } from './template';
import { FullArtifactName, artifactIdToString } from './package';

test('template serialization / deserialization', () => {
  const name: FullArtifactName = {
    type: 'template',
    pkg: '@milaboratory/some-package',
    id: 'the-template',
    version: '1.2.3'
  };
  const template1 = new Template(name,
    {
      data: {
        type: 'pl.tengo-template.v2',
        name: artifactIdToString(name),
        version: name.version,
        libs: {
          '@milaboratory/some-package:the-library': {
            name: '@milaboratory/some-package:the-library',
            version: '1.2.3',
            src: 'asdasd'
          }
        },
        templates: {
          '@milaboratory/some-package:the-template-1': {
            type: 'pl.tengo-template.v2',
            name: '@milaboratory/some-package:the-template-1',
            version: '1.2.3',
            libs: {
              '@milaboratory/some-package:the-library:1.2.4': {
                name: '@milaboratory/some-package:the-library',
                version: '1.2.4',
                src: 'asdasd'
              }
            },
            templates: {},
            src: 'src 1...'
          }
        },
        src: 'src 2 ...'
      }
    }
  );

  const template2 = new Template(
    { type: 'template', pkg: '@milaboratory/some-package', id: 'the-template', version: '1.2.3' },
    { content: template1.content }
  );

  console.log('Size: raw', JSON.stringify(template1.data).length, 'compressed', template1.content.byteLength);

  expect(template2.data).toStrictEqual(template1.data);
});
