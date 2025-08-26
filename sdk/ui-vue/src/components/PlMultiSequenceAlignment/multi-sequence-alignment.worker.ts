import kalign from '@milaboratories/biowasm-tools/kalign';
import { defaultSettings } from './settings';

async function multiSequenceAlignment(
  sequences: string[],
  alignmentParams = defaultSettings.alignmentParams,
): Promise<string[]> {
  if (sequences.length < 2) return sequences;
  const output = await kalign(
    sequences.map((sequence, index) => `>${index}\n${sequence}`).join('\n'),
    alignmentParams,
  );
  return parseKalignOutput(output);
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

addEventListener(
  'message',
  async ({ data }: MessageEvent<{ sequences: string[] }>) => {
    const { sequences } = data;
    postMessage(await multiSequenceAlignment(sequences));
  },
);
