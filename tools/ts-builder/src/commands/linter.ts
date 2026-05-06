import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, dirname, relative, matchesGlob } from "path";
import { fileURLToPath } from "url";
import { executeNativeCommand, resolveOxlint } from "./utils/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getDefaultConfigPath(): string {
  // __dirname points to dist/commands after build, config is in dist/configs
  return join(__dirname, "..", "configs", "oxlint-base.json");
}

/** Patterns that ban 'as T' type assertions for specific branded types. */
const BANNED_TYPE_ASSERTIONS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\bas\s+(Signed)?ResourceId\b/,
    message:
      "Casting 'as ResourceId' bypasses signature validation. " +
      "ResourceId must come from a typed API, not from a type assertion.",
  },
];

interface LintViolation {
  file: string;
  line: number;
  text: string;
  message: string;
}

function collectTsFiles(dir: string, ignorePatterns: string[]): string[] {
  const results: string[] = [];

  function walk(current: string) {
    let entries: import("fs").Dirent<string>[];
    try {
      entries = readdirSync(current, { withFileTypes: true, encoding: "utf-8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      const relPath = relative(dir, fullPath);

      if (entry.name === "node_modules" || entry.name === ".turbo") continue;
      if (ignorePatterns.some((p) => matchesGlob(relPath, p))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (
        /\.tsx?$/.test(entry.name) &&
        !/\.test\./.test(entry.name) &&
        !/\.spec\./.test(entry.name)
      ) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function readIgnorePatterns(configPath: string | undefined): string[] {
  if (!configPath || !existsSync(configPath)) return ["dist"];
  try {
    const raw = readFileSync(configPath, "utf-8");
    // strip single-line comments (oxlint allows them in JSON configs)
    const stripped = raw.replace(/\/\/.*$/gm, "");
    const config = JSON.parse(stripped);
    return config.ignorePatterns ?? ["dist"];
  } catch {
    return ["dist"];
  }
}

function checkBannedTypeAssertions(
  searchPaths: string[],
  ignorePatterns: string[],
): LintViolation[] {
  const violations: LintViolation[] = [];

  for (const searchPath of searchPaths) {
    const root =
      existsSync(searchPath) && statSync(searchPath).isDirectory() ? searchPath : process.cwd();
    const files = collectTsFiles(root, ignorePatterns);

    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("// lint-allow-cast")) continue;
        for (const rule of BANNED_TYPE_ASSERTIONS) {
          if (rule.pattern.test(lines[i])) {
            violations.push({
              file: relative(process.cwd(), file),
              line: i + 1,
              text: lines[i].trim(),
              message: rule.message,
            });
          }
        }
      }
    }
  }

  return violations;
}

export interface LintOptions {
  fix?: boolean;
  check?: boolean;
  config?: string;
}

export async function runLint(paths: string[], options: LintOptions = {}): Promise<void> {
  const oxlintCommand = resolveOxlint();
  const oxlintArgs: string[] = [];

  // Determine config path
  let configPath: string | undefined;
  if (options.config) {
    configPath = options.config;
  } else {
    // Check if local .oxlintrc.json exists in current directory
    const localConfig = join(process.cwd(), ".oxlintrc.json");
    if (existsSync(localConfig)) {
      configPath = localConfig;
    } else {
      // Use default config from ts-builder
      configPath = getDefaultConfigPath();
    }
  }

  if (configPath) {
    oxlintArgs.push("--config", configPath);
  }

  // Treat all warnings as errors
  oxlintArgs.push("--deny-warnings");

  if (options.fix) {
    oxlintArgs.push("--fix");
  }

  if (paths && paths.length > 0) {
    oxlintArgs.push(...paths);
  }

  console.log("Linting project...");

  await executeNativeCommand(oxlintCommand, oxlintArgs);

  // Run custom type assertion checks
  const ignorePatterns = readIgnorePatterns(configPath);
  const searchPaths = paths.length > 0 ? paths : ["."];
  const violations = checkBannedTypeAssertions(searchPaths, ignorePatterns);

  if (violations.length > 0) {
    console.error("");
    console.error("Banned type assertions found:");
    console.error("");
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}: ${v.text}`);
      console.error(`    ${v.message}`);
      console.error("");
    }
    process.exit(1);
  }

  console.log("Linting completed successfully");
}

export const linterCommand = new Command("linter")
  .description("Lint the project using oxlint (one of --check or --fix is required)")
  .option("--fix", "Apply fixes automatically")
  .option("--check", "Check for lint errors without fixing")
  .option("--config <path>", "Path to oxlint config file")
  .argument("[paths...]", "Paths to lint (defaults to current directory)")
  .action(async (paths, options) => {
    if (!options.check && !options.fix) {
      console.error("Error: one of --check or --fix is required");
      process.exit(1);
    }
    await runLint(paths, options);
  });
