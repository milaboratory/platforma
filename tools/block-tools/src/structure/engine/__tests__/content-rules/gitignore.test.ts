import { describe, test, expect } from "vitest";
import {
  ensureGitignoreEntries,
  removeGitignoreEntries,
  withManagedLines,
} from "../../content-rules";

function run(lines: string[], body: () => void): string[] {
  return withManagedLines(lines, body);
}

describe("ensureGitignoreEntries / removeGitignoreEntries", () => {
  test("appends missing entries", () => {
    const out = run([], () => ensureGitignoreEntries(["node_modules/", "dist/"]));
    expect(out).toEqual(["node_modules/", "dist/"]);
  });

  test("preserves existing entries; skips duplicates (whitespace + comment aware)", () => {
    const out = run(["  node_modules/   # vendored", "dist/"], () =>
      ensureGitignoreEntries(["node_modules/", "dist/"]),
    );
    expect(out).toEqual(["  node_modules/   # vendored", "dist/"]);
  });

  test("removeGitignoreEntries drops lines matching regex patterns", () => {
    const out = run(["node_modules/", "tmp/", "dist/", "log/"], () =>
      removeGitignoreEntries([/^tmp\//, /^log\//]),
    );
    expect(out).toEqual(["node_modules/", "dist/"]);
  });

  test("removeGitignoreEntries keeps blank/comment lines untouched", () => {
    const out = run(["# header", "", "tmp/"], () => removeGitignoreEntries([/^tmp\//]));
    expect(out).toEqual(["# header", ""]);
  });

  test("idempotent — ensure double-run is a no-op", () => {
    const seed = ["node_modules/"];
    const once = run([...seed], () => ensureGitignoreEntries(["node_modules/", "dist/"]));
    const twice = run([...once], () => ensureGitignoreEntries(["node_modules/", "dist/"]));
    expect(twice).toEqual(once);
  });

  test("idempotent — remove double-run is a no-op", () => {
    const seed = ["node_modules/", "tmp/"];
    const once = run([...seed], () => removeGitignoreEntries([/^tmp\//]));
    const twice = run([...once], () => removeGitignoreEntries([/^tmp\//]));
    expect(twice).toEqual(once);
  });
});
