import { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createFmtConfig,
  createLintConfigReference,
  getOxlintConfigForTarget,
  type TargetType,
} from "./utils/index";

export const vscodeIntegrationCommand = new Command("vscode-integration")
  .alias("cursor-integration")
  .description("Configure VSCode/Cursor IDE settings and oxc tooling for the monorepo")
  .action(async () => {
    const root = findMonorepoRoot();
    console.log(`Monorepo root: ${root}\n`);

    configureVscodeSettings(root);
    configureVscodeExtensions(root);
    ensureRootDeps(root);
    ensurePackageConfigs(root);

    console.log("\nDone.");
  });

const OXC_EXTENSION = "oxc.oxc-vscode";

const VSCODE_SETTINGS: Record<string, unknown> = {
  "[typescript]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[vue]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[javascript]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[css]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[scss]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[html]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[yaml]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[markdown]": { "editor.defaultFormatter": OXC_EXTENSION },
  "[json]": { "editor.defaultFormatter": OXC_EXTENSION },
  "typescript.tsdk": "./node_modules/typescript/lib",
};

function findMonorepoRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error("Could not find monorepo root (no pnpm-workspace.yaml found)");
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function configureVscodeSettings(root: string): void {
  const vscodeDir = join(root, ".vscode");
  const settingsPath = join(vscodeDir, "settings.json");

  if (!existsSync(vscodeDir)) {
    mkdirSync(vscodeDir, { recursive: true });
  }

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    settings = readJson(settingsPath);
  }

  let modified = false;
  for (const [key, value] of Object.entries(VSCODE_SETTINGS)) {
    if (!(key in settings)) {
      settings[key] = value;
      modified = true;
    }
  }

  if (modified || !existsSync(settingsPath)) {
    writeJson(settingsPath, settings);
    console.log("Updated .vscode/settings.json");
  } else {
    console.log(".vscode/settings.json already configured. Skipping...");
  }
}

function configureVscodeExtensions(root: string): void {
  const extensionsPath = join(root, ".vscode", "extensions.json");

  let extensions: { recommendations?: string[] } = {};
  if (existsSync(extensionsPath)) {
    extensions = readJson(extensionsPath) as typeof extensions;
  }

  if (!extensions.recommendations) {
    extensions.recommendations = [];
  }

  if (!extensions.recommendations.includes(OXC_EXTENSION)) {
    extensions.recommendations.push(OXC_EXTENSION);
    writeJson(extensionsPath, extensions);
    console.log("Updated .vscode/extensions.json");
  } else {
    console.log(".vscode/extensions.json already configured. Skipping...");
  }
}

function ensureRootDeps(root: string): void {
  const pkgPath = join(root, "package.json");
  const pkg = readJson(pkgPath) as {
    devDependencies?: Record<string, string>;
  };

  if (!pkg.devDependencies) {
    pkg.devDependencies = {};
  }

  let modified = false;
  for (const dep of ["oxlint", "oxfmt"]) {
    if (!(dep in pkg.devDependencies)) {
      pkg.devDependencies[dep] = "catalog:";
      modified = true;
      console.log(`Added ${dep} to root devDependencies`);
    }
  }

  if (modified) {
    writeJson(pkgPath, pkg);
    console.log("Updated root package.json");
  } else {
    console.log("Root package.json already has oxlint and oxfmt. Skipping...");
  }
}

function detectTarget(scripts: Record<string, string> | undefined): string | undefined {
  if (!scripts?.build) return undefined;
  const match = scripts.build.match(/--target\s+([a-z-]+)/);
  return match ? match[1] : undefined;
}

function resolveOxlintConfigType(pkgDir: string, relPath: string) {
  const pkg = readJson(join(pkgDir, "package.json")) as {
    scripts?: Record<string, string>;
  };
  const target = detectTarget(pkg.scripts);

  if (!target) {
    console.warn(`  Warning: Could not detect target for ${relPath}, using "node" as default`);
  }

  return getOxlintConfigForTarget((target || "node") as TargetType);
}

function findPackagesWithTsBuilder(root: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath) && dir !== root) {
      try {
        const pkg = readJson(pkgPath) as {
          devDependencies?: Record<string, string>;
          dependencies?: Record<string, string>;
        };
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        if ("@milaboratories/ts-builder" in allDeps) {
          results.push(dir);
        }
      } catch {
        // skip malformed package.json
      }
      return; // don't recurse into package subdirectories
    }

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath);
        }
      } catch {
        // skip inaccessible entries
      }
    }
  }

  walk(root);
  return results.sort();
}

function ensurePackageConfigs(root: string): void {
  const packages = findPackagesWithTsBuilder(root);
  console.log(`\nFound ${packages.length} packages with @milaboratories/ts-builder dependency\n`);

  const originalCwd = process.cwd();

  for (const pkgDir of packages) {
    const relPath = pkgDir.replace(root + "/", "");

    process.chdir(pkgDir);

    try {
      // .oxfmtrc.json
      createFmtConfig();

      // .oxlintrc.json
      const configType = resolveOxlintConfigType(pkgDir, relPath);
      createLintConfigReference(configType);
    } catch (error) {
      console.error(`  Error configuring ${relPath}:`, error);
    }
  }

  process.chdir(originalCwd);
}
