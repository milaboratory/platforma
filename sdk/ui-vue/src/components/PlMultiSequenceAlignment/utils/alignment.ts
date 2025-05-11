export function parseBiowasmAlignment(
  alignment: string,
): { header: string; sequence: string }[] {
  const lines = alignment.split('\n').filter((line) => line.trim() !== '');
  const sequences = [];

  let currentSequence: { header: string; sequence: string } | undefined = undefined;

  if (lines.length === 0) {
    return [];
  }

  for (const line of lines) {
    if (line.startsWith('>')) {
      if (currentSequence) {
        sequences.push(currentSequence);
      }
      currentSequence = {
        header: line.slice(1),
        sequence: '',
      };
    } else {
      currentSequence!.sequence += line;
    }
  }

  if (currentSequence) {
    sequences.push(currentSequence);
  }

  return sequences;
}
