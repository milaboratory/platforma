import { renameSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Rolldown preserves .vue and ?vue query params in output filenames
 * unlike Rollup. This plugin sanitizes ugly virtual module suffixes
 * (e.g. _vue_vue_type_script_setup_true_lang) while preserving .vue
 * in main SFC filenames so that TypeScript can resolve .vue.d.ts
 * declarations from imports like `from './Component.vue'`.
 *
 * Naming convention:
 *   Component.vue.js      — main SFC entry (keeps .vue)
 *   Component.vue2.js     — script virtual module (<script setup>)
 *   Component.style.js    — style virtual module (<style>)
 *
 * https://github.com/vitejs/vite-plugin-vue/issues/19
 */

export function sanitizeVueOutputPlugin(): Plugin {
  return {
    name: "sanitize-vue-output",
    enforce: "post",
    writeBundle(options) {
      const outDir = resolve(options.dir ?? "dist");
      const renames = new Map<string, string>();

      // Walk output directory and collect files needing rename
      walkDir(outDir, (filePath) => {
        const relPath = filePath.slice(outDir.length + 1);
        if (relPath.includes(".vue") || /_vue[._]vue[._]type[._]/.test(relPath)) {
          const newRelPath = sanitizeVueName(relPath);
          if (newRelPath !== relPath) {
            renames.set(relPath, newRelPath);
          }
        }
      });

      if (renames.size === 0) return;

      // Rename files on disk
      for (const [oldRel, newRel] of renames) {
        const oldPath = join(outDir, oldRel);
        const newPath = join(outDir, newRel);
        renameSync(oldPath, newPath);
      }

      // Update import references in all JS files
      walkDir(outDir, (filePath) => {
        if (!filePath.endsWith(".js")) return;
        let code = readFileSync(filePath, "utf-8");
        let changed = false;
        for (const [oldRel, newRel] of renames) {
          const oldBasename = oldRel.split("/").pop()!;
          const newBasename = newRel.split("/").pop()!;
          if (oldBasename !== newBasename && code.includes(oldBasename)) {
            code = code.replaceAll(oldBasename, newBasename);
            changed = true;
          }
        }
        if (changed) {
          writeFileSync(filePath, code);
        }
      });
    },
  };
}

function sanitizeVueName(name: string): string {
  const extMatch = name.match(/(\.d\.ts(?:\.map)?|\.[a-z]+(?:\.map)?)$/);
  const ext = extMatch?.[0] ?? "";
  const base = ext ? name.slice(0, -ext.length) : name;
  let sanitized = base.replace(/\?[^/]*/g, "");
  const vueVirtualMatch = sanitized.match(
    /^(.*?)[._]vue[._]vue[._]type[._](script|style|template)(?:[._].*)?$/,
  );
  if (vueVirtualMatch) {
    const type = vueVirtualMatch[2];
    sanitized = `${vueVirtualMatch[1]}.${type === "script" ? "vue2" : type}`;
  }
  return sanitized + ext;
}

function walkDir(dir: string, callback: (filePath: string) => void) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}
