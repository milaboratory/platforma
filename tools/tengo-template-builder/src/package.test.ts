import { Template } from './package';
import exp from 'node:constants';

test('template serialization / deserialization', () => {
  const template1 = new Template(
    { type: 'template', pkg: '@milaboratory/some-package', name: 'the-template', version: '1.2.3' },
    {
      data: {
        type: 'pl.tengo-template.v2',
        name: '@milaboratory/some-package:the-template:1.2.3',
        libs: { '@milaboratory/some-package:the-library:1.2.3': 'asdasd' },
        templates: {
          '@milaboratory/some-package:the-template-1': {
            type: 'pl.tengo-template.v2',
            name: '@milaboratory/some-package:the-template-1:1.2.3',
            libs: { '@milaboratory/some-package:the-library:1.2.4': 'asdasd' },
            src: 'src 1...'
          }
        },
        src: 'src 2 ...'
      }
    }
  );

  const template2 = new Template(
    { type: 'template', pkg: '@milaboratory/some-package', name: 'the-template', version: '1.2.3' },
    { content: template1.content }
  );

  console.log('Size: raw', JSON.stringify(template1.data).length, "compressed", template1.content.byteLength);

  expect(template2.data).toStrictEqual(template1.data);
});
