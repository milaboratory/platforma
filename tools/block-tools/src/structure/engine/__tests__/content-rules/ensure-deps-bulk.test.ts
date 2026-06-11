import { describe, test, expect } from "vitest";
import {
  ensureDeps,
  ensureDevDeps,
  ensureOptionalDeps,
  ensurePeerDeps,
  withManagedBody,
  type JsonObject,
} from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("bulk dep helpers", () => {
  test("ensureDeps adds many entries at once into dependencies", () => {
    const out = run({}, () => ensureDeps({ react: "catalog:", vue: "catalog:" }));
    expect(out).toEqual({
      dependencies: { react: "catalog:", vue: "catalog:" },
    });
  });

  test("ensureDevDeps / ensurePeerDeps / ensureOptionalDeps each target the right section", () => {
    const out = run({}, () => {
      ensureDevDeps({ vitest: "catalog:", tsc: "catalog:" });
      ensurePeerDeps({ typescript: "*" });
      ensureOptionalDeps({ fsevents: "*" });
    });
    expect(out).toEqual({
      devDependencies: { vitest: "catalog:", tsc: "catalog:" },
      peerDependencies: { typescript: "*" },
      optionalDependencies: { fsevents: "*" },
    });
  });

  test("idempotent — second run is a no-op", () => {
    const seed = {
      dependencies: { vue: "catalog:" },
    };
    const once = run({ ...seed }, () => ensureDeps({ react: "catalog:", vue: "catalog:" }));
    const twice = run(JSON.parse(JSON.stringify(once)), () =>
      ensureDeps({ react: "catalog:", vue: "catalog:" }),
    );
    expect(twice).toEqual(once);
  });
});
