import * as v from "valibot";
import { describe, expect, test } from "vitest";
import {
  BlockComponentsDescriptionRaw,
  BlockPackDescriptionRaw,
  BlockPackId,
  BlockPackIdNoVersion,
  BlockPackMetaEmbeddedBase64,
  BlockPackSpec,
  BlockPackOverviewNoRegistryId,
  ContentRelative,
  DescriptionContentBinary,
  DescriptionContentText,
  FoldersDocument,
  RegistrySpec,
  SemVer,
  Sha256Schema,
} from "./index";

const id = { organization: "org", name: "block", version: "1.2.3" };
const meta = {
  title: "Title",
  description: "Description",
  organization: { name: "Org", url: "https://example.com", extra: 1 },
  extra: 2,
};

describe("object modes", () => {
  test("strict objects reject unknown keys", () => {
    expect(v.safeParse(BlockPackId, { ...id, extra: 1 }).success).toBe(false);
    expect(
      v.safeParse(BlockPackIdNoVersion, { organization: "org", name: "block", version: "1" })
        .success,
    ).toBe(false);
    expect(v.safeParse(ContentRelative, { type: "relative", path: "a", extra: 1 }).success).toBe(
      false,
    );
  });

  test("loose objects keep unknown keys", () => {
    expect(v.parse(BlockPackMetaEmbeddedBase64, meta)).toEqual(meta);
  });

  test("plain objects drop unknown keys", () => {
    expect(v.parse(BlockPackSpec, { type: "dev-v2", folder: "/a", extra: 1 })).toEqual({
      type: "dev-v2",
      folder: "/a",
    });
  });
});

describe("package.json content forms", () => {
  test("text strings become relative or explicit content", () => {
    expect(v.parse(DescriptionContentText, "file:./a.md")).toEqual({
      type: "relative",
      path: "./a.md",
    });
    expect(v.parse(DescriptionContentText, "text")).toEqual({
      type: "explicit-string",
      content: "text",
    });
  });

  test("binary strings need the file prefix", () => {
    expect(v.parse(DescriptionContentBinary, "file:logo.png")).toEqual({
      type: "relative",
      path: "logo.png",
    });
    expect(v.safeParse(DescriptionContentBinary, "logo.png").success).toBe(false);
    expect(
      v.safeParse(DescriptionContentBinary, { type: "absolute-file", file: "rel/a" }).success,
    ).toBe(false);
    expect(
      v.safeParse(DescriptionContentBinary, {
        type: "explicit-base64",
        mimeType: "image/png",
        content: "!",
      }).success,
    ).toBe(false);
    const base64 = (mimeType: string) =>
      v.safeParse(DescriptionContentBinary, { type: "explicit-base64", mimeType, content: "" })
        .success;
    expect(base64("image/svg+xml")).toBe(true);
    expect(base64("x-conference/x-cooltalk")).toBe(true);
    expect(base64("not a mime: a/b !!")).toBe(false);
  });

  test("a bare workflow string becomes the wrapped form", () => {
    expect(
      v.parse(BlockComponentsDescriptionRaw, { workflow: "wf.tgz", model: "m", ui: "u" }),
    ).toEqual({
      workflow: { type: "workflow-v1", main: "wf.tgz" },
      model: "m",
      ui: "u",
    });
  });

  test("the description keeps unknown keys and the feature flags", () => {
    const description = {
      id,
      components: { workflow: "wf.tgz", model: "m", ui: "u" },
      meta,
      featureFlags: { supportsLazyState: true, requiresModelAPIVersion: 1 },
      kind: "kind@1.0.0",
      extra: 3,
    };
    expect(v.parse(BlockPackDescriptionRaw, description)).toMatchObject({
      featureFlags: description.featureFlags,
      kind: "kind@1.0.0",
      extra: 3,
    });
  });
});

describe("string checks", () => {
  test("meta urls and support contacts", () => {
    const withMeta = (extra: object) =>
      v.safeParse(BlockPackMetaEmbeddedBase64, { ...meta, ...extra }).success;
    expect(withMeta({ url: "https://example.com/a" })).toBe(true);
    expect(withMeta({ url: "example.com" })).toBe(false);
    expect(withMeta({ support: "https://example.com/support" })).toBe(true);
    expect(withMeta({ support: "help@example.com" })).toBe(true);
    expect(withMeta({ support: "mailto:help@example.com" })).toBe(true);
    expect(withMeta({ support: "o'brien@example.com" })).toBe(true);
    expect(withMeta({ support: "a@0a-.com" })).toBe(false);
    expect(withMeta({ support: "help" })).toBe(false);
    expect(v.safeParse(RegistrySpec, { type: "remote-v2", url: "not a url" }).success).toBe(false);
  });

  test("semver and sha256", () => {
    expect(v.safeParse(SemVer, "1.2.3-beta.1+build").success).toBe(true);
    expect(v.safeParse(SemVer, "1.2").success).toBe(false);
    expect(v.parse(Sha256Schema, "ab".repeat(32))).toBe("AB".repeat(32));
    expect(v.safeParse(Sha256Schema, "ab").success).toBe(false);
    expect(v.safeParse(Sha256Schema, "a" + "z".repeat(63)).success).toBe(false);
  });
});

describe("overviews and folders", () => {
  test("an overview without registry id keeps unknown keys", () => {
    const overview = {
      id: { organization: "org", name: "block" },
      latestByChannel: {},
      allVersions: [],
      extra: 1,
    };
    expect(v.parse(BlockPackOverviewNoRegistryId, overview)).toEqual(overview);
  });

  test("the folder document is strict and needs non-empty ids", () => {
    const document = {
      schemaVersion: 1,
      folders: [{ id: "f1", name: "Folder" }],
      assignments: {},
      templateAssignments: {},
    };
    expect(v.parse(FoldersDocument, document)).toEqual(document);
    expect(v.safeParse(FoldersDocument, { ...document, extra: 1 }).success).toBe(false);
    expect(v.safeParse(FoldersDocument, { ...document, assignments: { p: "" } }).success).toBe(
      false,
    );
  });
});
