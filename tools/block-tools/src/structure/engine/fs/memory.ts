// In-memory FS implementation. Files are stored as a flat
// `Map<path, string>`; directories exist implicitly when any contained
// file exists. Used by tests, by `simulateInit`, and by the runner's
// post-run recheck dry-run pass.

import type { DirEntry, FileSystem } from "./api";

function normalise(p: string): string {
  // Collapse repeated slashes, strip leading "./" and trailing "/".
  let out = p.replace(/\/{2,}/g, "/");
  if (out.startsWith("./")) out = out.slice(2);
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    if (initial) {
      for (const [k, v] of Object.entries(initial)) {
        this.files.set(normalise(k), v);
      }
    }
  }

  /** Snapshot of all files — handy for assertions. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of [...this.files.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out[k] = v;
    }
    return out;
  }

  async read(path: string): Promise<string> {
    const n = normalise(path);
    const v = this.files.get(n);
    if (v === undefined) throw new Error(`ENOENT: ${path}`);
    return v;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(normalise(path), content);
  }

  async exists(path: string): Promise<boolean> {
    const n = normalise(path);
    if (this.files.has(n)) return true;
    // Directory if any file is under `n/`.
    const prefix = n.endsWith("/") ? n : `${n}/`;
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) return true;
    }
    return false;
  }

  async list(dir: string): Promise<string[]> {
    const n = normalise(dir);
    const prefix = n === "" ? "" : `${n}/`;
    const out: string[] = [];
    for (const k of this.files.keys()) {
      if (n === "" || k.startsWith(prefix)) out.push(k);
    }
    return out.sort();
  }

  async listDir(dir: string): Promise<DirEntry[]> {
    const n = normalise(dir);
    const prefix = n === "" ? "" : `${n}/`;
    // Map immediate child name → isDirectory (a child is a directory if
    // the remainder after the first segment still contains a "/").
    const children = new Map<string, boolean>();
    for (const k of this.files.keys()) {
      if (n !== "" && !k.startsWith(prefix)) continue;
      const rest = n === "" ? k : k.slice(prefix.length);
      if (rest === "") continue;
      const slash = rest.indexOf("/");
      if (slash < 0) {
        children.set(rest, children.get(rest) ?? false);
      } else {
        children.set(rest.slice(0, slash), true);
      }
    }
    return [...children.entries()]
      .map(([name, isDirectory]) => ({ name, isDirectory }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async move(from: string, to: string): Promise<void> {
    const fromN = normalise(from);
    const toN = normalise(to);
    const fromPrefix = `${fromN}/`;
    const toPrefix = `${toN}/`;
    const moved: Array<[string, string]> = [];
    if (this.files.has(fromN)) {
      moved.push([fromN, toN]);
    }
    for (const k of this.files.keys()) {
      if (k.startsWith(fromPrefix)) {
        moved.push([k, toPrefix + k.slice(fromPrefix.length)]);
      }
    }
    if (moved.length === 0) {
      throw new Error(`move: source missing: ${from}`);
    }
    if (await this.exists(to)) {
      throw new Error(`move: dest exists: ${to}`);
    }
    for (const [src, dst] of moved) {
      this.files.set(dst, this.files.get(src)!);
      this.files.delete(src);
    }
  }

  async delete(path: string): Promise<void> {
    const n = normalise(path);
    const prefix = `${n}/`;
    this.files.delete(n);
    const toDelete: string[] = [];
    for (const k of this.files.keys()) {
      if (k.startsWith(prefix)) toDelete.push(k);
    }
    for (const k of toDelete) this.files.delete(k);
  }
}
