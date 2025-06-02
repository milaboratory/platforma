import { test, expect } from 'vitest';
import { HierarchicalWatcher } from './hierarchical_watcher';
import { Aborted } from '@milaboratories/ts-helpers';

test('create a tree watcher and watch for changes', () => {
  const grandChild1 = new HierarchicalWatcher();
  const child1 = new HierarchicalWatcher([grandChild1]);
  const child2 = new HierarchicalWatcher([]);
  const root = new HierarchicalWatcher([child1, child2]);

  expect(grandChild1.isChanged).toBe(false);
  expect(child1.isChanged).toBe(false);
  expect(child2.isChanged).toBe(false);
  expect(root.isChanged).toBe(false);

  grandChild1.markChanged();

  expect(grandChild1.isChanged).toBe(true);
  expect(child1.isChanged).toBe(true);
  expect(child2.isChanged).toBe(false);
  expect(root.isChanged).toBe(true);
});

test('do something in a tree watcher using a callback', async () => {
  const grandChild1 = new HierarchicalWatcher([]);
  const child1 = new HierarchicalWatcher([grandChild1]);
  const child2 = new HierarchicalWatcher([]);
  const root = new HierarchicalWatcher([child1, child2]);

  const signal = root.awaitChange();

  grandChild1.markChanged();

  await signal;
}, 1000);

test('do something in a tree watcher using a callback and abort signal', async () => {
  const grandChild1 = new HierarchicalWatcher([]);
  const child1 = new HierarchicalWatcher([grandChild1]);
  const child2 = new HierarchicalWatcher([]);
  const root = new HierarchicalWatcher([child1, child2]);

  const signal = root.awaitChange(AbortSignal.timeout(10));

  setTimeout(() => grandChild1.markChanged(), 100);

  await expect(signal).rejects.toThrow(Aborted);
}, 1000);
