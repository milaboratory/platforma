import { test, expect } from 'vitest';
import { ensureErrorLike } from './error_like_shape';

test('should create error like from string', () => {
  const errorLike = ensureErrorLike('test error');

  expect(errorLike.message).to.equal('"test error"');
  expect(errorLike.type).to.equal('StandardError');
});
