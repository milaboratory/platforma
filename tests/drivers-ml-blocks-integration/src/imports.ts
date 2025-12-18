import { createHash } from 'node:crypto';

// Helper function to create random buffer
export const createRandomBuffer = (size: number): Buffer => {
  const buffer = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    buffer[i] = Math.floor(Math.random() * 256);
  }
  return buffer;
};

// Helper function to compute hash incrementally for large buffers
export const computeHashIncremental = (buffer: Buffer): string => {
  const hasher = createHash('sha256');
  const chunkSize = 64 * 1024 * 1024; // 64 MB chunks
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, buffer.length);
    hasher.update(buffer.subarray(offset, end));
  }
  return hasher.digest('hex');
};

// Helper function to compare buffers in chunks
export const compareBuffersInChunks = (buffer1: Buffer, buffer2: Buffer): boolean => {
  if (buffer1.length !== buffer2.length) return false;

  const chunkSize = 64 * 1024 * 1024; // 64 MB chunks
  const totalChunks = Math.ceil(buffer1.length / chunkSize);
  let chunksCompared = 0;

  for (let offset = 0; offset < buffer1.length; offset += chunkSize) {
    const end = Math.min(offset + chunkSize, buffer1.length);
    const chunk1 = buffer1.subarray(offset, end);
    const chunk2 = buffer2.subarray(offset, end);

    if (!chunk1.equals(chunk2)) return false;

    chunksCompared++;
    if (chunksCompared % 20 === 0 || chunksCompared === totalChunks) {
      const progress = ((chunksCompared / totalChunks) * 100).toFixed(1);
      console.log(`    - Compared ${chunksCompared}/${totalChunks} chunks (${progress}%)`);
    }
  }

  return true;
};

export function shuffleInPlace<T>(array: T[]): void {
  let currentIndex = array.length;

  // While there remain elements to shuffle...
  while (currentIndex !== 0) {
    // Pick a remaining element...
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
}
