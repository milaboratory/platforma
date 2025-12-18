// @ts-expect-error legacy code
import init from '../assets/kalign';

export default async function kalign(
  input: string,
  params: { gpo?: number; gpe?: number; tgpe?: number } = {},
): Promise<string> {
  const module = await init();
  module.FS_writeFile('input.fa', input);
  module.callMain([
    '-q',
    '-i',
    'input.fa',
    '-o',
    'output.fa',
    ...Object.entries(params).flatMap(([key, value]) => {
      if (value === undefined) return [];
      return [`--${key}`, value.toString()];
    }),
  ]);
  return module.FS_readFile('output.fa', { encoding: 'utf8' });
}
