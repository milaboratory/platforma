import Aioli from '@milaboratories/biowasm-tools';
import type { PlMultiSequenceAlignmentModel } from '@platforma-sdk/model';
import { objectHash } from '../../objectHash';

const cache = new Map<string, string[]>();

export const defaultAlignmentParams = {
  gpo: 5.5,
  gpe: 2.0,
  tgpe: 1.0,
} satisfies PlMultiSequenceAlignmentModel['alignmentParams'];

const getCli = (() => {
  let cli: Aioli;
  return async () => {
    if (!cli) {
      cli = await new Aioli(['kalign']);
    }
    return cli;
  };
})();

export async function multiSequenceAlignment(
  sequences: string[],
  alignmentParams: PlMultiSequenceAlignmentModel['alignmentParams'] =
  defaultAlignmentParams,
): Promise<string[]> {
  if (sequences.length < 2) return sequences;
  const hash = await objectHash([sequences, alignmentParams]);
  let result = cache.get(hash);
  if (result) return result;
  const CLI = await getCli();
  const params = {
    input: `/shared/data/input-${hash}`,
    output: `/shared/data/output-${hash}`,
    ...alignmentParams,
  };
  CLI.mount(
    new File(
      sequences.map((sequence, index) => `>${index}\n${sequence}\n`),
      // HACK: remove when mount will handle mounts properly
      params.input.split('/').at(-1)!,
    ),
  );
  await CLI.exec(`kalign ${
    Object.entries(params)
      .map(([key, value]) => `--${key} ${value}`)
      .join(' ')
  }`);
  const output = await CLI.cat(params.output);
  result = parseKalignOutput(output);
  cache.set(hash, result);
  return result;
}

function parseKalignOutput(output: string): string[] {
  const result: string[] = [];
  let index = -1;
  for (let line of output.split('\n')) {
    line = line.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('>')) {
      index += 1;
      continue;
    }
    if (index >= 0) {
      result[index] = (result[index] ?? '').concat(line);
    }
  }
  return result;
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;

  test('parseKalignOutput', () => {
    const serialized = `some garbage
[some more garbage]
>1aab_
GKGDPKKPRG-KMSSYAFFVQTSREEHKKKHPDASVNFSEFSKKCSERWKTMSAKEKGKF
EDMAKADKARYEREMKTY-IPPKGE---------
>1j46_A
-----MQDRV-KRPMNAFIVWSRDQRRKMALENPRMRNSEISKQLGYQWKMLTEAEKWPF
FQEAQKLQAMHREKYPNYKYRPRRKAKMLPK---
>1k99_A
MKKLKKHPDFPKKPLTPYFRFFMEKRAKYAKLHPEMSNLDLTKILSKKYKELPEKKKMKY
IQDFQREKQ-EFERNLARFREDHPDLIQNAKK--
>2lef_A
-----MHI---KKPLNAFMLYMKEMRANVVAESTLKESAAINQILGRRWHALSREEQAKY
YELARKERQLHMQLYPGWSARDNYGKKKKRKREK`;

    expect(parseKalignOutput(serialized)).toEqual([
      'GKGDPKKPRG-KMSSYAFFVQTSREEHKKKHPDASVNFSEFSKKCSERWKTMSAKEKGKFEDMAKADKARYEREMKTY-IPPKGE---------',
      '-----MQDRV-KRPMNAFIVWSRDQRRKMALENPRMRNSEISKQLGYQWKMLTEAEKWPFFQEAQKLQAMHREKYPNYKYRPRRKAKMLPK---',
      'MKKLKKHPDFPKKPLTPYFRFFMEKRAKYAKLHPEMSNLDLTKILSKKYKELPEKKKMKYIQDFQREKQ-EFERNLARFREDHPDLIQNAKK--',
      '-----MHI---KKPLNAFMLYMKEMRANVVAESTLKESAAINQILGRRWHALSREEQAKYYELARKERQLHMQLYPGWSARDNYGKKKKRKREK',
    ]);
  });
}
