import { describe, it } from 'vitest';
import { logspace } from './logspace';

describe('Scales', () => {
  it('logspace', async () => {
    const res = logspace(0, 4, 10);

    console.log('res', res);
  });
});
