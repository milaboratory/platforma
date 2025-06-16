export const random = Math.random;

export function randomInt(): number {
  return (random() * Number.MAX_SAFE_INTEGER) | 0;
}

export function randomRangeFloat(min: number, max: number): number {
  return random() * (max - min) + min;
}

export function randomRangeInt(min: number, max: number): number {
  return Math.floor(randomRangeFloat(min, max));
}

export function randomSign(): number {
  return random() > 0.5 ? 1 : -1;
}
