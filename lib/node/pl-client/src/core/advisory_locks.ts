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

  /**
   * Releases the lock. Returns true if the lock becomes fully idle (no waiters, not acquired).
   */
  release(): boolean {
    if (!this.acquired) {
      throw new Error("Cannot release an unacquired lock");
    }

    if (this.resolvers.length) {
      this.resolvers.shift()?.();
      return false;
    } else {
      this.acquired = false;
      return true;
    }
  }
}

const m = new Map<string, AwaitLock>();

/**
 * Acquire a process-local async lock for the given id and return a release function.
 * Ensures only one concurrent operation per id within this process.
 */
export async function advisoryLock(id: string) {
  if (!m.has(id)) {
    m.set(id, new AwaitLock());
  }

  const lock = m.get(id)!;
  await lock.acquireAsync();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const nowIdle = lock.release();
    if (nowIdle) m.delete(id);
  };
}

/**
 * Run the callback under the lock for the given id; releases automatically.
 */
export async function advisoryLockCallback<T>(id: string, cb: () => Promise<T>): Promise<T> {
  const release = await advisoryLock(id);
  try {
    return await cb();
  } finally {
    release();
  }
}
