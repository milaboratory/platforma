// node:fs-backed implementation. Anchored at a configured `root`.
// All FileSystem methods take block-relative paths; this wrapper
// joins them against root before touching disk.

import fsp from "node:fs/promises";
import path from "node:path";
import type { DirEntry, FileSystem } from "./api";

export class NodeFileSystem implements FileSystem {
  constructor(private root: string) {}

  private abs(p: string): string {
    return path.resolve(this.root, p);
  }

  async read(p: string): Promise<string> {
    return fsp.readFile(this.abs(p), "utf-8");
  }

  async write(p: string, content: string): Promise<void> {
    const a = this.abs(p);
    await fsp.mkdir(path.dirname(a), { recursive: true });
    await fsp.writeFile(a, content, "utf-8");
  }

  async writeBinary(p: string, content: Uint8Array): Promise<void> {
    const a = this.abs(p);
    await fsp.mkdir(path.dirname(a), { recursive: true });
    await fsp.writeFile(a, content);
  }

  async exists(p: string): Promise<boolean> {
    try {
      await fsp.stat(this.abs(p));
      return true;
    } catch {
      return false;
    }
  }

  async list(dir: string): Promise<string[]> {
    const a = this.abs(dir);
    try {
      const stat = await fsp.stat(a);
      if (!stat.isDirectory()) return [];
    } catch {
      return [];
    }
    const out: string[] = [];
    async function walk(rel: string, absDir: string): Promise<void> {
      const entries = await fsp.readdir(absDir, { withFileTypes: true });
      for (const e of entries) {
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        const childAbs = path.join(absDir, e.name);
        if (e.isDirectory()) {
          await walk(childRel, childAbs);
        } else if (e.isFile()) {
          out.push(childRel);
        }
      }
    }
    await walk(dir === "" || dir === "." ? "" : dir, a);
    return out.sort();
  }

  async listDir(dir: string): Promise<DirEntry[]> {
    const a = this.abs(dir);
    let entries;
    try {
      entries = await fsp.readdir(a, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  async move(from: string, to: string): Promise<void> {
    const fromA = this.abs(from);
    const toA = this.abs(to);
    await fsp.mkdir(path.dirname(toA), { recursive: true });
    await fsp.rename(fromA, toA);
  }

  async delete(p: string): Promise<void> {
    await fsp.rm(this.abs(p), { recursive: true, force: true });
  }
}
