import kalign from '@milaboratories/biowasm-tools/kalign';
import type { PlMultiSequenceAlignmentSettings } from '@platforma-sdk/model';

addEventListener(
  'message',
  async ({ data }: MessageEvent<RequestMessage>) => {
    try {
      postMessage(await onMessage(data));
    } catch (error) {
      reportError(error);
    }
  },
);

export type RequestMessage = {
  sequences: string[];
  params: PlMultiSequenceAlignmentSettings['alignmentParams'];
};

export type ResponseMessage = string[];

async function onMessage(
  { sequences, params }: RequestMessage,
): Promise<ResponseMessage> {
  if (sequences.length < 2) {
    throw new Error(
      'Cannot run multiple sequences alignment on less than 2 sequences.',
    );
  }
  const input = sequences
    .map((sequence, index) => `>${index}\n${sequence}`)
    .join('\n');
  const output = await kalign(input, params);
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
