import Aioli from '@biowasm/aioli';
import type { SequenceRow } from './types';

// TODO: don't use the entire input as a key, prefer a hash instead
const cache = new Map<string, string>();

export async function multiSequenceAlignment(
  sequenceRows: SequenceRow[],
): Promise<SequenceRow[]> {
  const data = sequenceRows
    .map(({ sequence, header }) => `>${header}\n${sequence}`)
    .join('\n') + '\n';
  let output = cache.get(data);
  if (!output) {
    const CLI = await new Aioli(['kalign/3.3.1']);
    await CLI.mount({ name: 'input.fa', data });
    await CLI.exec('kalign input.fa -f fasta -o result.fasta');
    output = await CLI.cat('result.fasta');
    cache.set(data, output);
  }
  const labelsMap = new Map(
    sequenceRows.map((row) => [row.header, row.labels]),
  );
  return parseKalignOutput(output, labelsMap);
}

function parseKalignOutput(
  output: string,
  labelsMap: Map<string, string[]>,
): SequenceRow[] {
  return output.split('\n').reduce<SequenceRow[]>((result, line) => {
    line = line.trim();
    if (!line) return result;
    if (line.startsWith('>')) {
      const header = line.slice(1);
      const labels = labelsMap.get(header) ?? [];
      if (!labels.length) {
        console.warn(`missing labels for sequence ${header}`);
      }
      result.push({ header, labels, sequence: '' });
      return result;
    }
    const lastEntry = result.at(-1);
    if (!lastEntry) {
      throw new Error('Broken output from kalign, aborting.');
    }
    lastEntry.sequence += line;
    return result;
  }, []);
}
