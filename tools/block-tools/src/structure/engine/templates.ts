// Template-content provider for the runner.
//
// `file(path)` and `tpl(path, vars)` content forms resolve through this
// provider. Static templates live at `<root>/static/`; templated text
// lives at `<root>/text/`. The runner accepts a TemplateProvider via
// `RunOptions.templates`; the production CLI wires a NodeTemplateProvider
// rooted at the bundled `templates/` directory, and tests can use
// `MemoryTemplateProvider` or point at the on-disk templates directory
// during the Layer-2 zero-diff invariant.

import fs from "node:fs";
import path from "node:path";

export interface TemplateProvider {
  /** Read a static template file (under `<root>/static/`). */
  staticRead(p: string): string;
  /** Read a text template file (under `<root>/text/`). */
  textRead(p: string): string;
}

/** Provider backed by an on-disk template tree. Reads are synchronous
 *  so the runner can stay sync inside content-form resolution. */
export class NodeTemplateProvider implements TemplateProvider {
  constructor(private root: string) {}

  staticRead(p: string): string {
    return fs.readFileSync(path.resolve(this.root, "static", p), "utf-8");
  }

  textRead(p: string): string {
    return fs.readFileSync(path.resolve(this.root, "text", p), "utf-8");
  }
}

/** In-memory provider for tests. Keyed by the same `static/...` /
 *  `text/...` shape as on disk. */
export class MemoryTemplateProvider implements TemplateProvider {
  constructor(private files: Record<string, string>) {}

  staticRead(p: string): string {
    const k = `static/${p}`;
    const v = this.files[k];
    if (v === undefined) throw new Error(`MemoryTemplateProvider: missing '${k}'`);
    return v;
  }

  textRead(p: string): string {
    const k = `text/${p}`;
    const v = this.files[k];
    if (v === undefined) throw new Error(`MemoryTemplateProvider: missing '${k}'`);
    return v;
  }
}

/** Shell-style `${name}` substitution. Unknown names left as-is so
 *  template authors notice. Backslash escape is not supported. */
export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
    return vars[name] ?? `\${${name}}`;
  });
}
