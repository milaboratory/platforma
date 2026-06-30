import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { softwareBuildCacheEnv } from "./env";

// The block's turbo build task must cache-key on every software-build env var, declared once in the
// structurer template. This guards against the template drifting from softwareBuildCacheEnv.
const turboPath = fileURLToPath(
  new URL("../../structure/templates/static/root/turbo.json", import.meta.url),
);
const buildEnv: string[] = JSON.parse(readFileSync(turboPath, "utf8")).tasks.build.env;

describe("block turbo build cache env", () => {
  it("declares every software-build cache var", () => {
    for (const v of softwareBuildCacheEnv) expect(buildEnv).toContain(v);
  });

  it("keeps the pl-pkg transition vars while blocks still run pl-pkg build", () => {
    expect(buildEnv).toContain("PL_PKG_DEV");
    expect(buildEnv).toContain("PL_DOCKER_REGISTRY_PUSH_TO");
  });
});
