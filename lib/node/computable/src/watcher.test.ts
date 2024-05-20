import { HierarchicalWatcher } from './hierarchical_watcher';

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

    const signal = root.listen();

    grandChild1.markChanged();

    await signal;
}, 1000);

// class ChangeNode {
//     readonly name?: string;
//     readonly children: ChangeNode[];
//     readonly watcher: HierarchicalWatcher;
//
//     constructor(children: ChangeNode[], options: { name?: string }) {
//         this.name = options.name;
//         this.children = children;
//         this.watcher = new HierarchicalWatcher(
//             children.map((c) => c.watcher),
//             options
//         );
//     }
// }
//
// // updateTree is a test function of how to update
// // an HierarchicalWatcher. We'll probably use
// // something similar in MiddleLayer.
// function updateTree(node: ChangeNode): ChangeNode {
//     // const changed = node.children.filter((c) => c.watcher.isChanged);
//     // const newChildren = changed.map((c) => updateTree(c));
//     //
//     // const allChildren = node.children.subtract(changed).union(newChildren);
//     //
//     // return new HierarchicalWatcher(node.name + ':new', allChildren);
//
//     if (!node.watcher.isChanged) return node;
//     return new ChangeNode(
//         node.children.map((c) => (c.watcher.isChanged ? updateTree(c) : c)),
//         { name: node.name + ':new' }
//     );
// }
//
// test('update a tree after a watcher is done listening', async () => {
//     const grandChild1 = new ChangeNode([], { name: 'grandChild1' });
//     const child1 = new ChangeNode([grandChild1], { name: 'child1' });
//     const child2 = new ChangeNode([], { name: 'child2' });
//     const root = new ChangeNode([child1, child2], { name: 'root' });
//
//     grandChild1.watcher.markChanged();
//
//     await root.watcher.listen();
//
//     const newRoot = updateTree(root);
//
//     expect(newRoot).not.toBe(root);
//     expect(newRoot.watcher.isChanged).toBe(false);
//     expect(newRoot.name).toBe('root:new');
//     for (const c of newRoot.children) {
//         expect(['child2', 'child1:new']).toContain(c.name);
//         expect(c.watcher.isChanged).toBe(false);
//     }
// }, 1000);
