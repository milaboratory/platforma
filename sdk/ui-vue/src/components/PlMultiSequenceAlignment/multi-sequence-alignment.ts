/* eslint-disable @stylistic/indent */
import Aioli from '@milaboratories/biowasm-tools';
import { computedAsync, type MaybeRefOrGetter } from '@vueuse/core';
import { ref, toValue } from 'vue';

const cache = new Map<string, string[]>();

export function useAlignedSequences(sequences: MaybeRefOrGetter<string[]>) {
  const loading = ref(false);
  const data = computedAsync(
    () => multiSequenceAlignment(toValue(sequences)),
    [],
    { onError: () => (data.value = []), evaluating: loading },
  );
  return { data, loading };
}

export async function multiSequenceAlignment(
  sequences: string[],
): Promise<string[]> {
  const inputHash = await hash(sequences);
  let result = cache.get(inputHash);
  if (result) {
    return result;
  }
  const CLI = await new Aioli(['kalign']);
  const file = new File(
    sequences.map((sequence, index) => `>${index}\n${sequence}\n`),
    'input',
  );
  await CLI.mount(file);
  await CLI.exec('kalign -f fasta -i /shared/data/input -o /shared/data/output');
  const output = await CLI.cat('/shared/data/output');
  result = parseKalignOutput(output);
  cache.set(inputHash, result);
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
    result[index] = (result[index] ?? '').concat(line);
  }
  return result;
}

async function hash(rows: string[]): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const sha256 = (input: BufferSource) =>
    crypto.subtle.digest('SHA-256', input);
  const chunks = await Promise.all(rows.map(
    (sequence) => sha256(encoder.encode(sequence)),
  ));
  const data = chunks.reduce<Uint8Array>(
    (acc, chunk, index) => {
      acc.set(new Uint8Array(chunk), index * 32);
      return acc;
    },
    new Uint8Array(chunks.length * 32),
  );
  return decoder.decode(await sha256(data));
}

if (import.meta.vitest) {
  const { test, expect } = import.meta.vitest;

  test('parseKalignOutput', () => {
    const serialized = `>1aab_
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
