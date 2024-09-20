import { loadPackDescription, parsePackageName } from './source_package';

test('test parsing of convention package names', () => {
  expect(parsePackageName('@milaboratory/milaboratories.block-template')).toStrictEqual({
    organization: 'milaboratories',
    name: 'block-template'
  });

  expect(parsePackageName('milaboratories.block-template')).toStrictEqual({
    organization: 'milaboratories',
    name: 'block-template'
  });

  expect(parsePackageName('mi-laboratories.block-template')).toStrictEqual({
    organization: 'mi-laboratories',
    name: 'block-template'
  });

  expect(() => parsePackageName('block-template')).toThrow(/Malformed/);
});

test.skip('full description parsing test', async () => {
  const description = await loadPackDescription(
    '/Volumes/Data/Projects/MiLaboratory/blocks-beta/block-template'
  );
  console.dir(description, { depth: 5 });
});
