import { test, expect } from '@jest/globals';
import { formatError } from './error';

function f1() {
  throw new Error('Error1');
}

function f2() {
  try {
    f1();
  } catch (e: unknown) {
    throw new Error('Error2', { cause: e });
  }
}

test('Errors to string', () => {
  try {
    f2();
  } catch (e: any) {
    const formatted = formatError(e);
    expect(formatted).toContain('Error2');
    expect(formatted).toContain('Error1');
  }
});
