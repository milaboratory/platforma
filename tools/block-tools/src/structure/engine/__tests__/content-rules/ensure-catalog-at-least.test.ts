import { describe, expect, test } from "vitest";
import { ensureCatalogAtLeast, withManagedYaml } from "../../content-rules";
import { parseYaml } from "../../parsers/yaml";

function turboAfter(catalog: string): unknown {
  const doc = parseYaml(`catalog:\n${catalog}`);
  withManagedYaml(doc, () => ensureCatalogAtLeast("turbo", "~2.11.10"));
  return doc.getIn(["catalog", "turbo"]);
}

describe("ensureCatalogAtLeast", () => {
  test("raises a lower range", () => {
    expect(turboAfter("  turbo: ~2.8.11\n")).toBe("~2.11.10");
  });

  test("keeps an equal or higher range", () => {
    expect(turboAfter("  turbo: ^2.11.10\n")).toBe("^2.11.10");
    expect(turboAfter("  turbo: 2.12.0\n")).toBe("2.12.0");
  });

  test("adds an absent entry", () => {
    expect(turboAfter("  shx: ~0.4.0\n")).toBe("~2.11.10");
  });

  test("keeps an entry that is not a semver range", () => {
    expect(turboAfter("  turbo: latest\n")).toBe("latest");
  });
});
