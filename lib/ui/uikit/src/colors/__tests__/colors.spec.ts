import { describe } from 'node:test';
import { expect, test } from 'vitest';
import { Gradient } from '../colors';
import { viridis } from '../palette';

describe('Colors', () => {
  test('gradients', () => {
    const viridis5colors = Gradient(viridis).split(5);

    viridis5colors.forEach((color, i) => {
      expect(color.hex).toEqual(Gradient(viridis).takeNthOf(i + 1, 5).hex);
    });

    const viridis15 = Gradient(viridis).split(15);

    console.log('viridis15', JSON.stringify(viridis15));

    expect(viridis.map((it) => it + 'FF').join(',')).toEqual(viridis15.map((it) => it.hex.toUpperCase()).join(','));
  });
});
