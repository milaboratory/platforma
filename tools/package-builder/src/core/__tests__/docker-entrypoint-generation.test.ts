import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { PackageInfo } from "../package-info";
import type winston from "winston";

// Mock winston logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as winston.Logger;

// Mock the docker-python module
vi.mock("../docker-python", () => ({
  prepareDockerOptions: vi.fn().mockReturnValue({
    context: "/tmp/test-context",
    dockerfile: "/tmp/test-dockerfile",
    entrypoint: [],
  }),
}));

describe("Docker Entrypoint Generation", () => {
  let tempDir: string;
  let testPackageRoot: string;

  beforeEach(() => {
    // Create temporary directories for testing
    tempDir = fs.mkdtempSync(path.join("/tmp", "docker-entrypoint-test-"));
    testPackageRoot = path.join(tempDir, "package");

    fs.mkdirSync(testPackageRoot, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up temporary directories
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should generate Docker entrypoint for Python binary entrypoint", () => {
    const packageJson = {
      name: "test-python-package",
      version: "1.0.0",
      "block-software": {
        entrypoints: {
          script1: {
            binary: {
              artifact: {
                type: "python",
                environment: "@platforma-open/milaboratories.runenv-python-3:3.12.10",
                root: "./src",
                registry: "test-registry",
              },
              cmd: ["{pkg}/script1"],
            },
          },
        },
      },
    };

    fs.writeFileSync(
      path.join(testPackageRoot, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );

    const packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });
    const entrypoints = packageInfo.entrypoints;

    expect(entrypoints.has("script1")).toBe(true);
    expect(entrypoints.has("script1:docker")).toBe(true);

    const dockerEntrypoint = entrypoints.get("script1:docker")!;
    expect(dockerEntrypoint.type).toBe("software");
    if (dockerEntrypoint.type === "software") {
      expect(dockerEntrypoint.artifact.type).toBe("docker");
      expect(dockerEntrypoint.cmd).toEqual(["{pkg}/script1"]);
    }
  });

  it("should not generate Docker entrypoint for non-Python packages", () => {
    const packageJson = {
      name: "test-binary-package",
      version: "1.0.0",
      "block-software": {
        entrypoints: {
          script1: {
            binary: {
              artifact: {
                type: "binary",
                roots: {
                  "linux-x64": "./src",
                },
                registry: "test-registry",
              },
              cmd: ["{pkg}/script1"],
            },
          },
        },
      },
    };

    fs.writeFileSync(
      path.join(testPackageRoot, "package.json"),
      JSON.stringify(packageJson, null, 2),
    );

    const packageInfo = new PackageInfo(mockLogger, { packageRoot: testPackageRoot });
    const entrypoints = packageInfo.entrypoints;

    expect(entrypoints.has("script1")).toBe(true);
    expect(entrypoints.has("script1:docker")).toBe(false);
  });
});
