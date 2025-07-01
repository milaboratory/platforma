import { describe, it, expect } from 'vitest';
import { platforma } from '../blocks/sum/model';
import { delay } from '@milaboratories/helpers';

describe('BlockSum', () => {
  it('simple sum', async () => {
    // Test the mock API directly without Vue SDK
    const initialState = await platforma.loadBlockState();
    expect(initialState.value.outputs.sum.ok).toBe(true);
    if (initialState.value.outputs.sum.ok) {
      expect(initialState.value.outputs.sum.value).toEqual(0);
    }

    // Set new args
    await platforma.setBlockArgs({ x: 3, y: 3 });
    await delay(50);

    // Get patches to see the changes
    const patches1 = await platforma.getPatches(initialState.uTag);
    expect(patches1.value.length).toBeGreaterThan(0);

    // Check that the outputs changed in the patches
    const hasOutputChange = patches1.value.some((patch) =>
      patch.path.startsWith('/outputs/sum'),
    );
    expect(hasOutputChange).toBe(true);

    // Load new state to verify
    const newState1 = await platforma.loadBlockState();
    expect(newState1.value.outputs.sum.ok).toBe(true);
    if (newState1.value.outputs.sum.ok) {
      expect(newState1.value.outputs.sum.value).toEqual(6);
    }

    // Test second update
    await platforma.setBlockArgs({ x: 6, y: 6 });
    await delay(50);

    const patches2 = await platforma.getPatches(patches1.uTag);
    expect(patches2.value.length).toBeGreaterThan(0);

    const newState2 = await platforma.loadBlockState();
    expect(newState2.value.outputs.sum.ok).toBe(true);
    if (newState2.value.outputs.sum.ok) {
      expect(newState2.value.outputs.sum.value).toEqual(12);
    }

    // Test fourth update
    await platforma.setBlockArgs({ x: 30, y: 30 });
    await delay(50);

    const patches4 = await platforma.getPatches(patches2.uTag);
    expect(patches4.value.length).toBeGreaterThan(0);

    const newState4 = await platforma.loadBlockState();
    expect(newState4.value.outputs.sum.ok).toBe(true);
    if (newState4.value.outputs.sum.ok) {
      console.log('newState4', newState4.value.outputs.sum.value);
      expect(newState4.value.outputs.sum.value).toEqual(60);
    }
  });
});
