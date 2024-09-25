import type { Watcher } from '../watcher';
import { ChangeSource } from '../change_source';
import type { AccessorProvider, UsageGuard } from './accessor_provider';
import { randomUUID } from 'node:crypto';
import type { ComputableCtx } from './kernel';

export interface PersistentFakeTreeNode extends AccessorProvider<FakeTreeAccessor> {
  readonly uuid: string;
}

export class FakeTreeAccessor {
  constructor(
    private readonly node: FakeTreeNodeReader,
    private readonly watcher: Watcher,
    private readonly guard: UsageGuard,
    private readonly ctx: ComputableCtx
  ) {}

  get uuid(): string {
    return this.node.uuid;
  }

  private access() {
    this.guard();
    if (!this.isLocked()) this.ctx.markUnstable('not_locked');
  }

  listChildren(): string[] {
    this.access();
    return this.node.listChildren(this.watcher);
  }

  getValue(): string {
    this.access();
    return this.node.getValue(this.watcher);
  }

  get(key: string) {
    this.access();
    const childNode = this.node.get(this.watcher, key);
    if (!childNode) return undefined;
    return new FakeTreeAccessor(childNode, this.watcher, this.guard, this.ctx);
  }

  isLocked(): boolean {
    this.guard();
    return this.node.isLocked(this.watcher);
  }

  get persist(): PersistentFakeTreeNode {
    return {
      uuid: this.uuid,
      createAccessor: (ctx: ComputableCtx, guard: UsageGuard) => {
        return new FakeTreeAccessor(this.node, ctx.watcher, guard, ctx);
      }
    };
  }
}

export interface FakeTreeNodeReader {
  readonly uuid: string;

  listChildren(watcher: Watcher): string[];

  getValue(watcher: Watcher): string;

  get(watcher: Watcher, key: string): FakeTreeNodeReader | undefined;

  isLocked(watcher: Watcher): boolean;
}

interface FakeTreeNodeWriter {
  setValue(value: string): void;

  getOrCreateChild(key: string): FakeTreeNodeWriter;

  deleteChild(key: string): void;

  lock(): FakeTreeNodeWriter;

  unlock(): FakeTreeNodeWriter;
}

class FakeTreeBranch implements FakeTreeNodeWriter, FakeTreeNodeReader {
  public readonly uuid = randomUUID();
  private readonly children: Record<string, FakeTreeBranch> = {};
  private value: string = '';
  private locked: boolean = false;

  /** Tracks changes in the list of children */
  private readonly childrenListChange = new ChangeSource();
  /** Tracks current node deletion, all nested nodes add their watchers here */
  private readonly nodeDeleteChange = new ChangeSource();
  /** Tracks value changes */
  private readonly valueChange = new ChangeSource();
  /** Tracks changes of locked flag */
  private readonly lockedChange = new ChangeSource();

  deleteChild(key: string): void {
    if (!(key in this.children)) return;
    if (this.locked) throw new Error("Can't change field list after locked.");
    const child = this.children[key];
    delete this.children[key];
    child.nodeDeleteChange.markChanged();
    this.childrenListChange.markChanged();
  }

  getOrCreateChild(key: string): FakeTreeNodeWriter {
    let child = this.children[key];
    if (child) return child;
    if (this.locked) throw new Error("Can't change field list after locked.");
    child = new FakeTreeBranch();
    this.children[key] = child;
    this.childrenListChange.markChanged();
    return child;
  }

  setValue(value: string): void {
    if (this.locked) throw new Error("Can't set value after locked.");
    this.value = value;
    this.valueChange.markChanged();
  }

  lock(): FakeTreeNodeWriter {
    if (this.locked) return this;
    this.locked = true;
    this.lockedChange.markChanged();
    return this;
  }

  unlock(): FakeTreeNodeWriter {
    if (!this.locked) return this;
    this.locked = false;
    this.lockedChange.markChanged();
    return this;
  }

  get(watcher: Watcher, key: string): FakeTreeNodeReader | undefined {
    const child = this.children[key];
    if (!child) {
      this.childrenListChange.attachWatcher(watcher);
      return undefined;
    }
    // If key will be deleted, corresponding node will also be deleted, so there is no need to add watcher to childrenListChange
    child.nodeDeleteChange.attachWatcher(watcher);
    return child;
  }

  listChildren(watcher: Watcher): string[] {
    this.childrenListChange.attachWatcher(watcher);
    return Object.keys(this.children);
  }

  getValue(watcher: Watcher): string {
    this.valueChange.attachWatcher(watcher);
    return this.value;
  }

  isLocked(watcher: Watcher): boolean {
    this.lockedChange.attachWatcher(watcher);
    return this.locked;
  }
}

export class FakeTreeDriver {
  private readonly root: FakeTreeBranch = new FakeTreeBranch();

  get writer(): FakeTreeNodeWriter {
    return this.root;
  }

  get accessor(): PersistentFakeTreeNode {
    return {
      uuid: this.root.uuid,
      createAccessor: (ctx: ComputableCtx, guard: UsageGuard) => {
        return new FakeTreeAccessor(this.root, ctx.watcher, guard, ctx);
      }
    };
  }
}

interface FakeBackendSystem {
  tree: FakeTreeDriver;
}
