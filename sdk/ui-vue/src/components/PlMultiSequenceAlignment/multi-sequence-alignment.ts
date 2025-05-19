import Aioli from '@biowasm/aioli';
import {
  type MaybeRefOrGetter,
  onWatcherCleanup,
  reactive,
  toValue,
  watchEffect,
} from 'vue';
import type { SequenceRow } from './types';

export function useAlignedRows(sequenceRows: MaybeRefOrGetter<SequenceRow[]>) {
  const alignment = reactive({
    value: new Map<string, string>(),
    loading: false,
  });
  watchEffect(async () => {
    const inputRows = toValue(sequenceRows);
    let aborted = false;
    onWatcherCleanup(() => {
      aborted = true;
    });
    try {
      alignment.loading = true;
      const value = await multiSequenceAlignment(inputRows);
      if (aborted) return;
      alignment.value = value;
    } catch (error) {
      console.error(error);
      alignment.value.clear();
    } finally {
      alignment.loading = false;
    }
  });
  return alignment;
}

const cache = new Map<string, Map<string, string>>();

async function multiSequenceAlignment(
  sequenceRows: SequenceRow[],
): Promise<Map<string, string>> {
  const inputHash = await hash(sequenceRows);
  let result = cache.get(inputHash);
  if (result) {
    return result;
  }
  const CLI = await new Aioli(['kalign/3.3.1']);
  const file = new File(
    sequenceRows.map((row) => `>${row.header}\n${row.sequence}\n`),
    'input',
  );
  await CLI.mount(file);
  await CLI.exec('kalign -f fasta -i input -o output');
  const output = await CLI.cat('output');
  result = parseKalignOutput(output);
  cache.set(inputHash, result);
  return result;
}

function parseKalignOutput(output: string): Map<string, string> {
  const result = new Map<string, string>();
  let lastHeader = '';
  for (let line of output.split('\n')) {
    line = line.trim();
    if (!line) {
      continue;
    }
    if (line.startsWith('>')) {
      const header = line.slice(1);
      result.set(header, '');
      lastHeader = header;
      continue;
    }
    const sequence = result.get(lastHeader);
    if (sequence === undefined) {
      throw new Error('Malformed kalign output, aborting.');
    }
    result.set(lastHeader, sequence + line);
  }
  return result;
}

async function hash(rows: SequenceRow[]): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const sha256 = (input: BufferSource) =>
    crypto.subtle.digest('SHA-256', input);
  const chunks = await Promise.all(rows.map(
    ({ header, sequence }) => sha256(encoder.encode(`${header} ${sequence}`)),
  ));
  const data = chunks.reduce<Uint8Array>((acc, chunk, index) => {
    acc.set(new Uint8Array(chunk), index * 32);
    return acc;
  }, new Uint8Array(chunks.length * 32));
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
    const parsed = new Map([
      [
        '1aab_',
        'GKGDPKKPRG-KMSSYAFFVQTSREEHKKKHPDASVNFSEFSKKCSERWKTMSAKEKGKFEDMAKADKARYEREMKTY-IPPKGE---------',
      ],
      [
        '1j46_A',
        '-----MQDRV-KRPMNAFIVWSRDQRRKMALENPRMRNSEISKQLGYQWKMLTEAEKWPFFQEAQKLQAMHREKYPNYKYRPRRKAKMLPK---',
      ],
      [
        '1k99_A',
        'MKKLKKHPDFPKKPLTPYFRFFMEKRAKYAKLHPEMSNLDLTKILSKKYKELPEKKKMKYIQDFQREKQ-EFERNLARFREDHPDLIQNAKK--',
      ],
      [
        '2lef_A',
        '-----MHI---KKPLNAFMLYMKEMRANVVAESTLKESAAINQILGRRWHALSREEQAKYYELARKERQLHMQLYPGWSARDNYGKKKKRKREK',
      ],
    ]);
    expect(parseKalignOutput(serialized)).toEqual(parsed);
  });
}
