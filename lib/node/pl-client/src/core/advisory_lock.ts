class AwaitLock {
  private acquired = false;
  private resolvers: (() => void)[] = [];

  acquireAsync(): Promise<void> {
    if (!this.acquired) {
      this.acquired = true;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  release(): void {
    if (!this.acquired) {
      throw new Error('Cannot release an unacquired lock');
    }

    if (this.resolvers.length) {
      this.resolvers.shift()?.();
    } else {
      this.acquired = false;
    }
  }
}

const m = new Map<string, AwaitLock>();

export async function advisory_lock(id: string) {
  if (!m.has(id)) {
    const lock = new AwaitLock();
    m.set(id, lock);
  }

  await m.get(id)!.acquireAsync();

  return () => {
    m.get(id)!.release();
  };
}
