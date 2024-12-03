import { delay } from '@milaboratories/helpers';

export function fetchTestResult(n: number, pref: string): Promise<string>;
export function fetchTestResult(n: number): Promise<number>;
export async function fetchTestResult(n: number, pref?: string) {
  await delay(1000);
  if (n % 2 === 0) {
    console.log('two times more');
    await delay(1000);
  }

  if (n % 5 === 0) {
    throw Error('Test error, n = ' + n);
  }

  if (pref && pref.endsWith('h')) {
    throw Error('Test error, pref ends with `h`');
  }

  if (pref) {
    return `${pref}: ${n}`;
  }

  return n;
}
