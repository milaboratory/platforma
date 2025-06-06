import { describe } from 'node:test';
import { expect, test } from 'vitest';
import { Gradient } from '../gradient';
import { viridis } from '../palette';
import { Color } from '../color';

describe('Colors', () => {
  test('gradients', () => {
    const viridis5colors = Gradient(viridis).split(5);

    viridis5colors.forEach((color, i) => {
      expect(color.hex).toEqual(Gradient(viridis).getNthOf(i + 1, 5).hex);
    });

    const viridis15 = Gradient(viridis).split(15);

    expect(viridis.map((it) => it + 'FF').join(',')).toEqual(viridis15.map((it) => it.hex.toUpperCase()).join(','));
  });

  test('categorical colors', () => {
    const color = Color.categorical('lime_light');

    expect(color.hex.toUpperCase()).toEqual('#CBEB67FF');
  });
});
