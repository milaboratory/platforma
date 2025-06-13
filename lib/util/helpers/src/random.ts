export const random = Math.random;
export const randomInt = (random() * Number.MAX_SAFE_INTEGER) | 0;

export function randomRangeFloat(min: number, max: number): number {
  return random() * (max - min) + min;
}

export function randomRangeInt(min: number, max: number): number {
  return Math.floor(randomRangeFloat(min, max));
}

export function randomSign(): number {
  return random() > 0.5 ? 1 : -1;
}

export function randomId(): string {
  return String(Math.trunc(Date.now() * Math.random()));
}

export function randomShortId(): string {
  return randomId().slice(-6);
}
