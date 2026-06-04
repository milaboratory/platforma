// Small filesystem abstraction used by the engine. Two implementations:
//   - memory.ts: in-memory map, used by tests and the post-run recheck
//     dry-run.
//   - node.ts:   thin wrapper around node:fs (synchronous).
// Paths are always block-relative ("/"-separated) — the impls anchor
// them against a configured root.
//
// The interface is SYNCHRONOUS. The structurer is a one-shot CLI, so
// blocking fs calls (readFileSync, …) carry no event-loop cost, and a
// sync engine keeps the module-global run context race-free by
// construction (a sync call stack cannot interleave).

/** One shallow child of a directory (file or sub-directory). */
export type DirEntry = {
  name: string;
  isDirectory: boolean;
};

export interface FileSystem {
  /** Read file as utf-8 string. Throws on missing file. */
  read(path: string): string;
  /** Write file (utf-8). Creates parent dirs as needed. Overwrites. */
  write(path: string, content: string): void;
  /** Write raw bytes. Creates parent dirs as needed. Overwrites. For binary
   *  assets (logos, images) that must not be utf-8 encoded. */
  writeBinary(path: string, content: Uint8Array): void;
  /** Path exists (file or directory). */
  exists(path: string): boolean;
  /** Recursive listing under a directory (relative paths, files only).
   *  Empty array if directory missing. */
  list(dir: string): string[];
  /** Shallow listing of a directory's immediate children (files +
   *  sub-dirs). Empty array if the directory is missing. Used by
   *  filesystem-backed DISCOVERY. */
  listDir(dir: string): DirEntry[];
  /** Move a file or directory. Source must exist; dest must not. */
  move(from: string, to: string): void;
  /** Delete a file or directory recursively. Missing is no-op. */
  delete(path: string): void;
}
