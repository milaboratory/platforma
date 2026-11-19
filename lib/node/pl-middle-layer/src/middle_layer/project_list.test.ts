/**
 * The project-list reader against a hand-built projects resource: what it keeps, what it skips
 * and in which order. No backend — `projectListEntries` is the whole computable body, fed here
 * with a stand-in node instead of a synchronized tree.
 */

import { describe, expect, it } from "vitest";
import type { ResourceType } from "@milaboratories/pl-client";
import { asSignedResourceId } from "@milaboratories/pl-client";
import type { ProjectMeta } from "@milaboratories/pl-model-middle-layer";
import {
  ProjectCreatedTimestamp,
  ProjectLastModifiedTimestamp,
  ProjectMetaKey,
  ProjectResourceType,
} from "../model/project_model";
import type { ProjectId } from "../model/project_model";
import { projectListEntries } from "./project_list";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** One field of the projects resource: a node, or a field that resolves to nothing. */
interface Entry {
  readonly field: string;
  readonly id?: number;
  readonly type?: ResourceType;
  readonly kv?: Record<string, unknown>;
  /** A field whose value has not resolved yet — `traverse` returns undefined. */
  readonly unresolved?: boolean;
}

/** A project field with the metadata a synced project carries. */
function project(field: string, id: number, label: string, created: number, modified: number) {
  return {
    field,
    id,
    type: ProjectResourceType,
    kv: {
      [ProjectMetaKey]: { label } satisfies ProjectMeta,
      [ProjectCreatedTimestamp]: created,
      [ProjectLastModifiedTimestamp]: modified,
    },
  } satisfies Entry;
}

/** Stand-in for the projects-list tree node, carrying exactly what the reader reads. */
function projectsNode(...entries: Entry[]) {
  return {
    listDynamicFields: () => entries.map((e) => e.field),
    traverse: (fieldName: string) => {
      const entry = entries.find((e) => e.field === fieldName);
      if (entry === undefined || entry.unresolved) return undefined;
      return {
        id: asSignedResourceId(`0x${(entry.id ?? 0).toString(16)}|ab`),
        resourceType: entry.type ?? ProjectResourceType,
        getKeyValueAsJson: <T>(key: string) => (entry.kv ?? {})[key] as T | undefined,
      };
    },
  };
}

const NoneOpened: ProjectId[] = [];

// ── Tests ────────────────────────────────────────────────────────────────────

describe("tolerance", () => {
  it("keeps every synced project", () => {
    const entries = projectListEntries(
      projectsNode(project("uuid-a", 1, "A", 100, 100), project("uuid-b", 2, "B", 200, 200)),
      NoneOpened,
    );

    expect(entries.map((e) => e.meta.label)).toStrictEqual(["B", "A"]);
    expect(entries[1].created).toStrictEqual(new Date(100));
    expect(entries[1].lastModified).toStrictEqual(new Date(100));
  });

  it("skips a sibling that is not a project, and keeps the projects around it", () => {
    const entries = projectListEntries(
      projectsNode(
        project("uuid-a", 1, "A", 100, 100),
        { field: "folders", id: 9, type: { name: "Folders", version: "1" } },
        project("uuid-b", 2, "B", 200, 200),
      ),
      NoneOpened,
    );

    expect(entries.map((e) => e.meta.label)).toStrictEqual(["B", "A"]);
  });

  it("skips a project whose metadata has not synced yet", () => {
    const halfSynced = [
      { name: "no key at all", kv: {} },
      {
        name: "meta missing",
        kv: { [ProjectCreatedTimestamp]: 1, [ProjectLastModifiedTimestamp]: 1 },
      },
      {
        name: "created missing",
        kv: { [ProjectMetaKey]: { label: "x" }, [ProjectLastModifiedTimestamp]: 1 },
      },
      {
        name: "lastModified missing",
        kv: { [ProjectMetaKey]: { label: "x" }, [ProjectCreatedTimestamp]: 1 },
      },
    ];

    for (const { name, kv } of halfSynced) {
      const entries = projectListEntries(
        projectsNode(
          { field: "uuid-half", id: 9, type: ProjectResourceType, kv },
          project("uuid-a", 1, "A", 100, 100),
        ),
        NoneOpened,
      );
      expect(
        entries.map((e) => e.meta.label),
        name,
      ).toStrictEqual(["A"]);
    }
  });

  it("skips a field that resolves to nothing", () => {
    const entries = projectListEntries(
      projectsNode({ field: "uuid-pending", unresolved: true }, project("uuid-a", 1, "A", 1, 1)),
      NoneOpened,
    );

    expect(entries.map((e) => e.meta.label)).toStrictEqual(["A"]);
  });

  it("returns an empty list rather than throwing when nothing on the resource is a project", () => {
    const entries = projectListEntries(
      projectsNode({ field: "folders", id: 9, type: { name: "Folders", version: "1" } }),
      NoneOpened,
    );

    expect(entries).toStrictEqual([]);
  });
});

describe("ordering", () => {
  it("sorts most recently modified first, regardless of field order", () => {
    const entries = projectListEntries(
      projectsNode(
        project("uuid-mid", 1, "mid", 0, 200),
        project("uuid-newest", 2, "newest", 0, 300),
        project("uuid-oldest", 3, "oldest", 0, 100),
      ),
      NoneOpened,
    );

    expect(entries.map((e) => e.meta.label)).toStrictEqual(["newest", "mid", "oldest"]);
  });

  it("orders on last-modified and not on creation", () => {
    const entries = projectListEntries(
      projectsNode(
        project("uuid-a", 1, "created first, touched last", 100, 900),
        project("uuid-b", 2, "created last, touched first", 800, 850),
      ),
      NoneOpened,
    );

    expect(entries.map((e) => e.meta.label)).toStrictEqual([
      "created first, touched last",
      "created last, touched first",
    ]);
  });
});

describe("opened flag", () => {
  it("marks exactly the projects the caller lists as opened", () => {
    const node = projectsNode(project("uuid-a", 1, "A", 1, 1), project("uuid-b", 2, "B", 2, 2));
    const opened = projectListEntries(node, NoneOpened)
      .filter((e) => e.meta.label === "A")
      .map((e) => e.id);

    const entries = projectListEntries(node, opened);

    expect(entries.filter((e) => e.opened).map((e) => e.meta.label)).toStrictEqual(["A"]);
  });
});
