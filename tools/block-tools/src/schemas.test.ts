import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  PlRegFullPackageConfigData,
  PlRegPackageConfigDataShard,
} from "./registry_v1/config_schema";
import { parseSchema } from "./util";
import { KindImplementer, parseGlobalOverviewReg } from "./v2/registry";

describe("registry v1 config", () => {
  test("an empty shard gets empty registries and files", () => {
    expect(v.parse(PlRegPackageConfigDataShard, {})).toEqual({ registries: {}, files: {} });
  });

  test("the full config needs a registry and a version", () => {
    const config = { organization: "org", package: "pkg", meta: { extra: 1 } };
    expect(v.safeParse(PlRegFullPackageConfigData, config).success).toBe(false);
    expect(
      v.parse(PlRegFullPackageConfigData, {
        ...config,
        registry: "main",
        version: "1.0.0",
        unknown: 1,
      }),
    ).toEqual({ ...config, registry: "main", version: "1.0.0", registries: {}, files: {} });
    expect(
      v.safeParse(PlRegFullPackageConfigData, {
        ...config,
        registry: "main",
        version: "1.0.0",
        files: { "a/b": "x" },
      }).success,
    ).toBe(false);
  });
});

describe("registry v2 schemas", () => {
  test("implementer channels default to an empty list", () => {
    const implementer = {
      id: { organization: "org", name: "block", version: "1.0.0" },
      kindVersion: "1.0.0",
    };
    expect(v.parse(KindImplementer, implementer)).toEqual({ ...implementer, channels: [] });
  });

  test("the global overview needs a latest entry or the legacy fields", () => {
    const entry = { id: { organization: "org", name: "block" }, allVersionsWithChannels: [] };
    expect(() => parseGlobalOverviewReg({ schema: "v2", packages: [entry] })).toThrow(
      /latestByChannel\[any\]/,
    );
  });
});

describe("parse errors", () => {
  test("list every issue with its path", () => {
    expect(() =>
      parseSchema(PlRegFullPackageConfigData, { organization: "org", package: "pkg", meta: {} }),
    ).toThrow(/→ at registry[\s\S]*→ at version/);
  });
});
