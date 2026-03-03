import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { Plugin } from "rolldown";

/** Resolves .d.ts side-effect imports (e.g. `import {} from "./global"`) as empty modules */
export function dtsResolvePlugin(): Plugin {
  return {
    name: "dts-resolve",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;
      const dir = dirname(importer);
      const candidate = resolve(dir, source + ".d.ts");
      if (existsSync(candidate)) {
        return { id: candidate, external: true };
      }
      return null;
    },
  };
}
