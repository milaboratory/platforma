import { describe, test, expect } from "vitest";
import {
  ensureDep,
  ensureDevDep,
  ensureOptionalDep,
  ensurePeerDep,
  removeDep,
  withManagedBody,
  type JsonObject,
} from "../../content-rules";

function run(input: JsonObject, body: () => void): JsonObject {
  return withManagedBody(input, body);
}

describe("ensureDep / ensureDevDep / ensurePeerDep / ensureOptionalDep / removeDep", () => {
  test("ensureDep places the entry in dependencies on empty object", () => {
    const out = run({}, () => ensureDep("react", "catalog:"));
    expect(out).toEqual({ dependencies: { react: "catalog:" } });
  });

  test("ensureDev/peer/optional each target the right section", () => {
    const out = run({}, () => {
      ensureDevDep("vitest", "catalog:");
      ensurePeerDep("typescript", "*");
      ensureOptionalDep("fsevents", "*");
    });
    expect(out).toEqual({
      devDependencies: { vitest: "catalog:" },
      peerDependencies: { typescript: "*" },
      optionalDependencies: { fsevents: "*" },
    });
  });

  test("single-section invariant: moves a dep from one section to another", () => {
    const input = { devDependencies: { react: "catalog:" } };
    const out = run(input, () => ensureDep("react", "catalog:"));
    expect(out.dependencies).toEqual({ react: "catalog:" });
    expect((out.devDependencies as Record<string, unknown>).react).toBeUndefined();
  });

  test("removeDep clears an entry from any section", () => {
    const out = run(
      { devDependencies: { react: "catalog:" }, peerDependencies: { react: "*" } },
      () => removeDep("react"),
    );
    const dd = out.devDependencies as Record<string, unknown> | undefined;
    const pd = out.peerDependencies as Record<string, unknown> | undefined;
    expect(dd?.react).toBeUndefined();
    expect(pd?.react).toBeUndefined();
  });

  test("removeDep is a no-op when the dep is absent", () => {
    const out = run({ dependencies: { vue: "catalog:" } }, () => removeDep("react"));
    expect(out).toEqual({ dependencies: { vue: "catalog:" } });
  });

  test("idempotent — second run is a no-op", () => {
    const once = run({}, () => ensureDep("react", "catalog:"));
    const twice = run(JSON.parse(JSON.stringify(once)), () => ensureDep("react", "catalog:"));
    expect(twice).toEqual(once);
  });
});
