// fd-lock ships no types. Minimal surface we use: a cross-process advisory lock (flock) over an fd.
declare module "fd-lock" {
  export default class FDLock {
    constructor(fd: number, opts?: { wait?: boolean });
    readonly locked: boolean;
    /** Acquire the lock; blocks until available when constructed with { wait: true }. */
    ready(): Promise<void>;
    /** Release the lock and close the underlying fd. */
    close(): Promise<void>;
  }
}
