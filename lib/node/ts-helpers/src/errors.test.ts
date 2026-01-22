import { describe, test, expect } from 'vitest';
import { findNamedErrorInCauses } from './errors';

class TestError extends Error {
  name = 'TestError';
}

class TestError2 extends TestError {
  name = 'TestError2';
}

class TestError3 extends TestError2 {
  name = 'TestError3';
}

describe('findNamedErrorInCauses', () => {
  test('should find direct error', () => {
    const err = new TestError3('test');
    const found = findNamedErrorInCauses(err, TestError3);
    expect(found).toBe(err);
  });

  test('should find error next in chain', () => {
    const searchedErr = new TestError3('searched');
    const finalErr = new TestError2('final', { cause: searchedErr });
    const found = findNamedErrorInCauses(finalErr, TestError3);
    expect(found).toBe(searchedErr);
  });

  test('should find error deep in chain', () => {
    const searchedErr = new TestError3('searched');
    const intermediateErr1 = new TestError2('intermediate1', { cause: searchedErr });
    const intermediateErr2 = new TestError2('intermediate2', { cause: intermediateErr1 });
    const finalErr = new TestError('final', { cause: intermediateErr2 });
    const found = findNamedErrorInCauses(finalErr, TestError3);
    expect(found).toBe(searchedErr);
  });

  test('should respect max depth', () => {
    const searchedErr = new TestError3('searched');
    let currentErr: Error = searchedErr;
    // Create a chain longer than default maxDepth (10)
    for (let i = 0; i < 15; i++) {
      currentErr = new TestError2(`level${i}`, { cause: currentErr });
    }
    const finalErr = new TestError('final', { cause: currentErr });
    
    // Should find it with large max depth
    const foundWithDefault = findNamedErrorInCauses(finalErr, TestError3, 20);
    expect(foundWithDefault).toBe(searchedErr);
    
    // Should not find it with maxDepth less than chain length
    const foundWithLowDepth = findNamedErrorInCauses(finalErr, TestError3, 5);
    expect(foundWithLowDepth).toBeUndefined();
  });

  test('should not break on recursive chain', () => {
    const err = new TestError('test');
    err.cause = err;
    const found = findNamedErrorInCauses(err, TestError3);
    expect(found).toBeUndefined();
  });

  test('should return undefined if no error is found', () => {
    const err = new TestError('test');
    const found = findNamedErrorInCauses(err, TestError3);
    expect(found).toBeUndefined();
  });
});
