import { newTemplateFromContent, newTemplateFromData } from "./template";
import { formatArtefactNameAndVersion, FullArtifactName } from "./package";
import { templateNodeHash } from "@milaboratories/pl-model-backend";
import type { TemplateNodeV4 } from "@milaboratories/pl-model-backend";
import { test, expect } from "vitest";

test("template serialization / deserialization", () => {
  const name: FullArtifactName = {
    type: "template",
    pkg: "@milaboratory/some-package",
    id: "the-template",
    version: "1.2.3",
  };

  const child: TemplateNodeV4 = {
    name: "@milaboratory/some-package:the-template-1",
    version: "1.2.3",
    libs: {
      "@milaboratory/some-package:the-library:1.2.4": {
        name: "@milaboratory/some-package:the-library",
        version: "1.2.4",
        sourceHash: "asdasd2",
      },
    },
    templates: {},
    software: {},
    assets: {},
    sourceHash: "src 1...",
  };
  const childHash = templateNodeHash(child);

  const root: TemplateNodeV4 = {
    sourceHash: "asdasd3",
    ...formatArtefactNameAndVersion(name),
    libs: {
      asdasd: {
        name: "@milaboratory/some-package:the-library",
        version: "1.2.3",
        sourceHash: "asdasd",
      },
    },
    templates: {
      asdasd2: childHash,
    },
    software: {},
    assets: {},
  };
  const rootHash = templateNodeHash(root);

  const template1 = newTemplateFromData("dist", name, {
    type: "pl.tengo-template.v4",
    hashToSource: {
      asdasd: "src1...",
      asdasd2: "src2...",
      asdasd3: "src3...",
    },
    hashToTemplate: {
      [childHash]: child,
      [rootHash]: root,
    },
    template: rootHash,
  });

  const template2 = newTemplateFromContent(
    "dist",
    { type: "template", pkg: "@milaboratory/some-package", id: "the-template", version: "1.2.3" },
    template1.content,
  );

  expect(template2.data).toStrictEqual(template1.data);
});

test("a node referenced twice is stored once", () => {
  const shared: TemplateNodeV4 = {
    name: "@milaboratory/some-package:shared",
    version: "1.0.0",
    sourceHash: "shared-src",
    libs: {},
    templates: {},
    software: {},
    assets: {},
  };
  const sharedHash = templateNodeHash(shared);

  const name: FullArtifactName = {
    type: "template",
    pkg: "@milaboratory/some-package",
    id: "the-template",
    version: "1.2.3",
  };
  const root: TemplateNodeV4 = {
    ...formatArtefactNameAndVersion(name),
    sourceHash: "root-src",
    libs: {},
    // Two aliases, one node — the case v3 serialised twice.
    templates: { first: sharedHash, second: sharedHash },
    software: {},
    assets: {},
  };

  const template = newTemplateFromData("dist", name, {
    type: "pl.tengo-template.v4",
    hashToSource: { "root-src": "root source", "shared-src": "shared source" },
    hashToTemplate: { [sharedHash]: shared, [templateNodeHash(root)]: root },
    template: templateNodeHash(root),
  });

  expect(Object.keys(template.data.hashToTemplate)).toHaveLength(2);
  expect(template.data.hashToTemplate[sharedHash]).toBe(shared);
});

test("identical nodes reached by different aliases collapse to one hash", () => {
  const make = (): TemplateNodeV4 => ({
    name: "@milaboratory/some-package:leaf",
    version: "1.0.0",
    sourceHash: "leaf-src",
    libs: {},
    templates: {},
    software: {},
    assets: {},
  });

  // Distinct objects, identical content.
  expect(templateNodeHash(make())).toBe(templateNodeHash(make()));
});

test("hashOverride changes a node's identity", () => {
  const base: TemplateNodeV4 = {
    name: "@milaboratory/some-package:leaf",
    version: "1.0.0",
    sourceHash: "leaf-src",
    libs: {},
    templates: {},
    software: {},
    assets: {},
  };
  const overridden: TemplateNodeV4 = {
    ...base,
    hashOverride: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
  };

  expect(templateNodeHash(base)).not.toBe(templateNodeHash(overridden));
});

test("a node's hash covers its children", () => {
  const childA: TemplateNodeV4 = {
    name: "@milaboratory/some-package:child",
    version: "1.0.0",
    sourceHash: "child-src-a",
    libs: {},
    templates: {},
    software: {},
    assets: {},
  };
  const childB: TemplateNodeV4 = { ...childA, sourceHash: "child-src-b" };

  const parent = (childHash: string): TemplateNodeV4 => ({
    name: "@milaboratory/some-package:parent",
    version: "1.0.0",
    sourceHash: "parent-src",
    libs: {},
    templates: { only: childHash },
    software: {},
    assets: {},
  });

  expect(templateNodeHash(parent(templateNodeHash(childA)))).not.toBe(
    templateNodeHash(parent(templateNodeHash(childB))),
  );
});
