// node:fs-backed implementation (synchronous). Anchored at a configured
// `root`. All FileSystem methods take block-relative paths; this wrapper
// joins them against root before touching disk.

import fs from "node:fs";
import path from "node:path";
import type { DirEntry, FileSystem } from "./api";

export class NodeFileSystem implements FileSystem {
  constructor(private root: string) {}

  private abs(p: string): string {
    return path.resolve(this.root, p);
  }

  read(p: string): string {
    return fs.readFileSync(this.abs(p), "utf-8");
  }

  write(p: string, content: string): void {
    const a = this.abs(p);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, content, "utf-8");
  }

  writeBinary(p: string, content: Uint8Array): void {
    const a = this.abs(p);
    fs.mkdirSync(path.dirname(a), { recursive: true });
    fs.writeFileSync(a, content);
  }

  exists(p: string): boolean {
    try {
      fs.statSync(this.abs(p));
      return true;
    } catch {
      return false;
    }
  }

  list(dir: string): string[] {
    const a = this.abs(dir);
    try {
      const stat = fs.statSync(a);
      if (!stat.isDirectory()) return [];
    } catch {
      return [];
    }
    const out: string[] = [];
    function walk(rel: string, absDir: string): void {
      const entries = fs.readdirSync(absDir, { withFileTypes: true });
      for (const e of entries) {
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        const childAbs = path.join(absDir, e.name);
        if (e.isDirectory()) {
          walk(childRel, childAbs);
        } else if (e.isFile()) {
          out.push(childRel);
        }
      }
    }
    walk(dir === "" || dir === "." ? "" : dir, a);
    return out.sort();
  }

  listDir(dir: string): DirEntry[] {
    const a = this.abs(dir);
    let entries;
    try {
      entries = fs.readdirSync(a, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
      .sort((x, y) => x.name.localeCompare(y.name));
  }

  move(from: string, to: string): void {
    const fromA = this.abs(from);
    const toA = this.abs(to);
    fs.mkdirSync(path.dirname(toA), { recursive: true });
    fs.renameSync(fromA, toA);
  }

  delete(p: string): void {
    fs.rmSync(this.abs(p), { recursive: true, force: true });
  }
}
