import { describe, it, expect } from "vitest";
import { softwareBuildCacheEnv } from "./env";
import { rootTurboJsonInitial } from "../../structure/rules/root-turbo-json";

// The block's turbo build task must cache-key on every software-build env var, declared once in the
// structurer's turbo.json rule. This guards against the rule drifting from softwareBuildCacheEnv.
const buildEnv = (rootTurboJsonInitial().tasks as { build: { env: string[] } }).build.env;

describe("block turbo build cache env", () => {
  it("declares every software-build cache var", () => {
    for (const v of softwareBuildCacheEnv) expect(buildEnv).toContain(v);
  });
});
