export function logspace(startExp: number, stopExp: number, num = 50, base = 10) {
  if (num <= 0) return [];

  const step = (stopExp - startExp) / (num - 1);
  const result = [];

  for (let i = 0; i < num; i++) {
    const exponent = startExp + i * step;
    result.push(Math.pow(base, exponent));
  }

  return result;
}
