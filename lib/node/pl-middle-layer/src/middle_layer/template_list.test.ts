/**
 * The template-list reader against a hand-built templates resource: what it keeps, what it skips
 * and in which order. No backend — `templateListEntries` is the whole computable body, fed here
 * with a stand-in node instead of a synchronized tree.
 */

import { describe, expect, it } from "vitest";
import type { ResourceType } from "@milaboratories/pl-client";
import { asSignedResourceId } from "@milaboratories/pl-client";
import type { BlockKindSelectorReference } from "@milaboratories/pl-model-common";
import { PROJECT_TEMPLATE_SCHEMA_V1 } from "@milaboratories/pl-model-common";
import type { StoredTemplateData } from "./template_list";
import {
  TemplateCreatedTimestamp,
  TemplateDescriptionKey,
  TemplateLabelKey,
  TemplateResourceType,
  templateListEntries,
} from "./template_list";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** One field of the templates resource: a node, or a field that resolves to nothing. */
interface Entry {
  readonly field: string;
  readonly id?: number;
  readonly type?: ResourceType;
  readonly data?: StoredTemplateData;
  readonly kv?: Record<string, unknown>;
  /** A field whose value has not resolved yet — `traverse` returns undefined. */
  readonly unresolved?: boolean;
}

/** A stored document listing the given number of blocks; only its length is read. */
function stored(blocks: number): StoredTemplateData {
  return {
    schemaVersion: 1,
    document: {
      schema: PROJECT_TEMPLATE_SCHEMA_V1,
      blocks: Array.from({ length: blocks }, (_, i) => ({
        id: `block-${i}`,
        kind: KIND,
        params: {},
      })),
    },
  };
}

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

/** A template field with the data and metadata a synced template carries. */
function template(field: string, id: number, label: string, created: number) {
  return {
    field,
    id,
    type: TemplateResourceType,
    data: stored(2),
    kv: { [TemplateLabelKey]: label, [TemplateCreatedTimestamp]: created },
  } satisfies Entry;
}

/** Stand-in for the templates-list tree node, carrying exactly what the reader reads. */
function templatesNode(...entries: Entry[]) {
  return {
    listDynamicFields: () => entries.map((e) => e.field),
    traverse: (fieldName: string) => {
      const entry = entries.find((e) => e.field === fieldName);
      if (entry === undefined || entry.unresolved) return undefined;
      return {
        id: asSignedResourceId(`0x${(entry.id ?? 0).toString(16)}|ab`),
        resourceType: entry.type ?? TemplateResourceType,
        getDataAsJson: <T>() => entry.data as T | undefined,
        getKeyValueAsJson: <T>(key: string) => (entry.kv ?? {})[key] as T | undefined,
      };
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("tolerance", () => {
  it("keeps every synced template", () => {
    const entries = templateListEntries(
      templatesNode(template("uuid-a", 1, "A", 100), template("uuid-b", 2, "B", 200)),
    );

    expect(entries.map((e) => e.label)).toStrictEqual(["B", "A"]);
    expect(entries[1].created).toStrictEqual(new Date(100));
    expect(entries[1].blockCount).toBe(2);
  });

  it("skips a sibling that is not a template, and keeps the templates around it", () => {
    const entries = templateListEntries(
      templatesNode(
        template("uuid-a", 1, "A", 100),
        { field: "stray", id: 9, type: { name: "Folders", version: "1" }, data: stored(1) },
        template("uuid-b", 2, "B", 200),
      ),
    );

    expect(entries.map((e) => e.label)).toStrictEqual(["B", "A"]);
  });

  it("skips a template whose data or metadata has not synced yet", () => {
    const halfSynced: { name: string; data?: StoredTemplateData; kv: Record<string, unknown> }[] = [
      { name: "data missing", kv: { [TemplateLabelKey]: "x", [TemplateCreatedTimestamp]: 1 } },
      { name: "label missing", data: stored(1), kv: { [TemplateCreatedTimestamp]: 1 } },
      { name: "created missing", data: stored(1), kv: { [TemplateLabelKey]: "x" } },
    ];

    for (const { name, data, kv } of halfSynced) {
      const entries = templateListEntries(
        templatesNode(
          { field: "uuid-half", id: 9, type: TemplateResourceType, data, kv },
          template("uuid-a", 1, "A", 100),
        ),
      );
      expect(
        entries.map((e) => e.label),
        name,
      ).toStrictEqual(["A"]);
    }
  });

  it("skips a field that resolves to nothing", () => {
    const entries = templateListEntries(
      templatesNode({ field: "uuid-pending", unresolved: true }, template("uuid-a", 1, "A", 1)),
    );

    expect(entries.map((e) => e.label)).toStrictEqual(["A"]);
  });
});

describe("description", () => {
  it("carries a description, and reads a blank one as none", () => {
    const described = template("uuid-a", 1, "A", 100);
    const blank = template("uuid-b", 2, "B", 200);
    const entries = templateListEntries(
      templatesNode(
        { ...described, kv: { ...described.kv, [TemplateDescriptionKey]: "  Plates  " } },
        { ...blank, kv: { ...blank.kv, [TemplateDescriptionKey]: "   " } },
      ),
    );

    expect(entries.find((e) => e.label === "A")?.description).toBe("Plates");
    expect(entries.find((e) => e.label === "B")).not.toHaveProperty("description");
  });
});
