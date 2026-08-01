import { createHash } from "node:crypto";
import type { PlTransaction } from "@milaboratories/pl-client";
import type { CompiledTemplateV3, TemplateDataV3 } from "@milaboratories/pl-model-backend";
import { describe, expect, test, vi } from "vitest";
import { createTemplateV3Tree } from "./direct_template_loader_v3";

/**
 * Minimal stand-in for {@link PlTransaction}: `createTemplateV3Tree` only creates values,
 * structs and fields, so counting those is enough to observe its deduplication behaviour
 * without a backend.
 */
function fakeTx() {
  let next = 0;
  const created: string[] = [];
  const tx = {
    createValue: (type: { name: string }) => {
      created.push(type.name);
      return `value-${next++}`;
    },
    createStruct: (type: { name: string }) => {
      created.push(type.name);
      return `struct-${next++}`;
    },
    createField: () => {},
    setField: () => {},
    setKValue: () => {},
    lock: () => {},
  };
  return { tx: tx as unknown as PlTransaction, created };
}

function sourceHashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** A template node plus the `hashToSource` entries its subtree needs. */
function templateNode(name: string, children: Record<string, TemplateDataV3> = {}): TemplateDataV3 {
  return {
    name,
    version: "1.0.0",
    sourceHash: sourceHashOf(`source of ${name}`),
    libs: {},
    templates: children,
    software: {},
    assets: {},
  };
}

function compiled(root: TemplateDataV3): CompiledTemplateV3 {
  const hashToSource: Record<string, string> = {};
  const visit = (node: TemplateDataV3) => {
    hashToSource[node.sourceHash] = `source of ${node.name}`;
    for (const child of Object.values(node.templates)) visit(child);
  };
  visit(root);
  return { type: "pl.tengo-template.v3", hashToSource, template: root };
}

/** Chain of `depth` nested templates, each the sole child of the previous one. */
function chain(depth: number): TemplateDataV3 {
  let node = templateNode("leaf");
  for (let level = depth - 1; level >= 0; level--) {
    node = templateNode(`level-${level}`, { child: node });
  }
  return node;
}

describe("createTemplateV3Tree", () => {
  test("structurally identical subtrees collapse to one resource", () => {
    // Same shape, two different aliases: the cache key must not depend on the alias.
    const root = templateNode("root", {
      first: templateNode("shared", { inner: templateNode("inner") }),
      second: templateNode("shared", { inner: templateNode("inner") }),
    });

    const { tx, created } = fakeTx();
    createTemplateV3Tree(tx, compiled(root));

    // root + shared + inner, not root + 2×(shared + inner).
    expect(created).toHaveLength(3);
  });

  test("subtrees that differ are kept apart", () => {
    const root = templateNode("root", {
      first: templateNode("shared", { inner: templateNode("inner-a") }),
      second: templateNode("shared", { inner: templateNode("inner-b") }),
    });

    const { tx, created } = fakeTx();
    createTemplateV3Tree(tx, compiled(root));

    // root + 2 × (shared + inner): the differing leaves must not collapse.
    expect(created).toHaveLength(5);
  });

  test("child alias enumeration order does not change the result", () => {
    const build = (order: "ab" | "ba") => {
      const alpha = templateNode("alpha");
      const beta = templateNode("beta");
      const children =
        order === "ab" ? { alpha, beta } : ({ beta, alpha } as Record<string, TemplateDataV3>);
      const { tx, created } = fakeTx();
      createTemplateV3Tree(tx, compiled(templateNode("root", children)));
      return created.length;
    };

    expect(build("ab")).toBe(build("ba"));
  });

  test("hashing is linear in tree size, not quadratic", () => {
    // The regression this guards: `TemplateRenderer.updateCacheKey` used to recurse into
    // every descendant, so a node at depth d re-hashed its whole subtree and the total was
    // O(n²). Counting Hash.update calls measures that directly and deterministically.
    const hashPrototype = Object.getPrototypeOf(createHash("sha256")) as {
      update: (...args: unknown[]) => unknown;
    };

    const measure = (depth: number) => {
      const spy = vi.spyOn(hashPrototype, "update");
      try {
        const { tx } = fakeTx();
        createTemplateV3Tree(tx, compiled(chain(depth)));
        return spy.mock.calls.length;
      } finally {
        spy.mockRestore();
      }
    };

    const small = measure(50);
    const large = measure(200);

    // Linear: 4× the nodes costs ~4× the hashing. Quadratic would be ~16×.
    expect(large / small).toBeLessThan(6);
  });

  test("a tree handed to us twice is not re-hashed", () => {
    // `getPreparedExportTemplateEnvelope()` memoises one spec object for the process, and
    // `ProjectMutator.load` re-renders it on every project mutation, so this repeat path is
    // the common one — see the 25 % worker burn in tasks/MILAB-6653/COLD-OPEN.md §4.
    const spec = compiled(chain(100));
    const hashPrototype = Object.getPrototypeOf(createHash("sha256")) as {
      update: (...args: unknown[]) => unknown;
    };

    createTemplateV3Tree(fakeTx().tx, spec);

    const spy = vi.spyOn(hashPrototype, "update");
    try {
      const { tx, created } = fakeTx();
      createTemplateV3Tree(tx, spec);
      expect(spy.mock.calls).toHaveLength(0);
      // Resources are transaction-scoped, so they must still be created every time.
      expect(created).toHaveLength(101);
    } finally {
      spy.mockRestore();
    }
  });
});
