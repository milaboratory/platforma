import { describe, test, expect } from "vitest";
import {
  ensureField,
  ensureGitignoreEntries,
  ensureCatalogVersion,
  withManagedBody,
  withManagedYaml,
} from "../../content-rules";
import { parseYaml } from "../../parsers/yaml";

describe("active-state guards", () => {
  test("JSON-only builder throws inside a YAML body", () => {
    const doc = parseYaml("catalog: {}\n");
    expect(() =>
      withManagedYaml(doc, () => {
        ensureField("type", "module");
      }),
    ).toThrow(/requires a JSON-managed body/);
  });

  test("YAML-only builder throws inside a JSON body", () => {
    expect(() =>
      withManagedBody({}, () => {
        ensureCatalogVersion("yaml", "1.0.0");
      }),
    ).toThrow(/requires a YAML-managed body/);
  });

  test("lines-only builder throws inside a JSON body", () => {
    expect(() =>
      withManagedBody({}, () => {
        ensureGitignoreEntries(["node_modules/"]);
      }),
    ).toThrow(/requires a lines-managed body/);
  });

  test("nested managed bodies are rejected", () => {
    expect(() =>
      withManagedBody({}, () => {
        withManagedBody({}, () => {
          ensureField("x", 1);
        });
      }),
    ).toThrow(/Nested managed/);
  });

  test("builder called outside any body throws a clear message", () => {
    expect(() => ensureCatalogVersion("y", "1")).toThrow(/only valid inside a managed/);
  });

  test("active state is reset after a body throws", () => {
    expect(() =>
      withManagedBody({}, () => {
        throw new Error("boom");
      }),
    ).toThrow(/boom/);
    // If the active state had leaked, the next call would think it's
    // still inside a body.
    expect(() => ensureField("x", 1)).toThrow(/only valid inside a managed/);
  });
});
