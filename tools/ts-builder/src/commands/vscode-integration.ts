import { Command } from "commander";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseJsonc } from "jsonc-parser";
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
    console.log(`📂 Monorepo root: ${root}\n`);

    configureVscodeSettings(root);
    configureVscodeExtensions(root);
    ensureDeps(root);
    ensurePackageConfigs(root);
    removeEslintConfigs(root);

    console.log("\n✅ Done! Please reload VSCode/Cursor to apply changes.");
  });

const OXC_EXTENSION = "oxc.oxc-vscode";

const VSCODE_SETTINGS: Record<string, unknown> = {
  "editor.defaultFormatter": OXC_EXTENSION,
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
  return parseJsonc(readFileSync(filePath, "utf-8"));
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

  for (const [key, value] of Object.entries(VSCODE_SETTINGS)) {
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof settings[key] === "object" &&
      settings[key] !== null &&
      !Array.isArray(settings[key])
    ) {
      settings[key] = {
        ...(settings[key] as Record<string, unknown>),
        ...(value as Record<string, unknown>),
      };
    } else {
      settings[key] = value;
    }
  }

  writeJson(settingsPath, settings);
  console.log("⚙️  Updated .vscode/settings.json");
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
    console.log("🧩 Updated .vscode/extensions.json");
  } else {
    console.log("🧩 .vscode/extensions.json already configured. Skipping...");
  }
}

function ensureDeps(root: string): void {
  const oxcDeps = ["oxlint", "oxfmt"];
  const pkgPath = join(root, "package.json");
  const pkg = readJson(pkgPath) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };

  let modified = false;

  for (const dep of oxcDeps) {
    if (pkg.dependencies?.[dep]) {
      delete pkg.dependencies[dep];
      modified = true;
    }
    if (pkg.devDependencies?.[dep]) {
      delete pkg.devDependencies[dep];
      modified = true;
    }

    if (!pkg.peerDependencies) {
      pkg.peerDependencies = {};
    }
    if (!(dep in pkg.peerDependencies)) {
      pkg.peerDependencies[dep] = "*";
      modified = true;
    }
  }

  if (modified) {
    writeJson(pkgPath, pkg);
    console.log("📦 Ensured oxlint/oxfmt as peerDependencies in root package.json");
  } else {
    console.log("📦 Root package.json already configured. Skipping...");
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
    console.warn(`⚠️  Could not detect target for ${relPath}, using "node" as default`);
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
        if (lstatSync(fullPath).isDirectory()) {
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

const ESLINT_CONFIG_PATTERNS = [
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs",
  "eslint.config.ts",
  ".eslintignore",
];

function removeEslintConfigs(root: string): void {
  const packages = findPackagesWithTsBuilder(root);
  let removed = 0;

  for (const pkgDir of packages) {
    for (const name of ESLINT_CONFIG_PATTERNS) {
      const filePath = join(pkgDir, name);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        const relPath = filePath.replace(root + "/", "");
        console.log(`🗑️  Removed ${relPath}`);
        removed++;
      }
    }
  }

  if (removed > 0) {
    console.log(`🗑️  Removed ${removed} ESLint config file(s)`);
  } else {
    console.log("🗑️  No ESLint config files found to remove.");
  }
}

function ensurePackageConfigs(root: string): void {
  const packages = findPackagesWithTsBuilder(root);
  console.log(
    `\n🔍 Found ${packages.length} packages with @milaboratories/ts-builder dependency\n`,
  );

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
      console.error(`❌ Error configuring ${relPath}:`, error);
    }
  }

  process.chdir(originalCwd);
}
