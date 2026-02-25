import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig, type ViteUserConfig } from "vitest/config";

function findMonorepoRoot(startDir: string): string | undefined {
  let current = startDir;
  while (current !== dirname(current)) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = dirname(current);
  }
  return undefined;
}

export const TestTags = {
  Flaky: "flaky",
} as const;

export const createVitestConfig = (overrides: ViteUserConfig = {}): ViteUserConfig => {
  const projectRoot = dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = findMonorepoRoot(projectRoot);

  let coverageInclude = [
    "**/src/**/*.{ts,js,vue,mts,mjs,cts,cjs}",
    "**/dist/**/*.{ts,js,vue,mts,mjs,cts,cjs}",
  ];
  let coverageExclude = [
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/test/**",
    "**/tests/**",
    "**/node_modules/**",
    "**/coverage/**",
  ];

  if (monorepoRoot) {
    coverageInclude = coverageInclude.map((path) => resolve(monorepoRoot, path));
    coverageExclude = coverageExclude.map((path) => resolve(monorepoRoot, path));
  }

  return mergeConfig(
    {
      test: {
        pool: "forks",
        watch: false,
        passWithNoTests: true,
        server: {
          deps: {
            inline: [/@milaboratories\//],
          },
        },
        coverage: {
          include: coverageInclude,
          exclude: coverageExclude,
          provider: "istanbul",
          reporter: ["lcovonly", "text"],
          reportsDirectory: "./coverage",
        },
        reporters: ["default", ["junit", { outputFile: "test-report.junit.xml" }]],
        // If several tags have the same options and are used on the same test,
        // they will be resolved in the order they were specified,
        // or sorted by priority first (the lower the number, the higher the priority).
        // Tags without a defined priority are merged first and will be overriden by higher priority ones
        tags: [
          {
            name: TestTags.Flaky,
            retry: 3,
            timeout: 30_000,
          },
        ],
      },
    },
    overrides,
  );
};
