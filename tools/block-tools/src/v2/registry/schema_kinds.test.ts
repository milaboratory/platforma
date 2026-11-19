import { describe, expect, test } from "vitest";
import { formatKindRef, parseKindRef } from "@milaboratories/pl-model-common";
import { kindContentPrefix, kindOverviewPath, npmNameToKindPath } from "./schema_kinds";

/**
 * Seam-2 regression guard: a kind's reference is the FULL npm package name +
 * version, and EVERYONE derives the S3 `{org, name}` from that npm name via the
 * single `npmNameToKindPath` helper. If content and overview ever derive the
 * folder differently again, this round-trip fails.
 */
describe("kind reference / path derivation round-trip", () => {
  const npmName = "@platforma-open/milaboratories.mixcr-clonotyping.kind";
  const version = "1.2.0";

  test("npmName -> formatKindRef -> parseKindRef preserves name and version", () => {
    const ref = formatKindRef({ name: npmName, version });
    expect(ref).toBe(`${npmName}@${version}`);

    // Split on the LAST '@', so the scoped npm name (which itself starts with
    // '@') survives intact.
    const parsed = parseKindRef(ref);
    expect(parsed).toEqual({ name: npmName, version });
  });

  test("content path and overview path share the same {org, name} folder", () => {
    const ref = formatKindRef({ name: npmName, version });
    const parsed = parseKindRef(ref);

    // The SINGLE derivation everyone uses.
    const loc = npmNameToKindPath(parsed.name);

    const contentPrefix = kindContentPrefix(parsed.name, parsed.version);
    const overviewPath = kindOverviewPath(loc);

    // Strip the version segment / the overview filename to expose the folder.
    const contentDir = contentPrefix.slice(0, contentPrefix.lastIndexOf("/"));
    const overviewDir = overviewPath.slice(0, overviewPath.lastIndexOf("/"));

    expect(contentDir).toBe(overviewDir);
    // kindContentPrefix derives {org,name} internally from the SAME npm name, so
    // the co-located folder is exactly `kinds/{org}/{name}`.
    expect(contentDir).toBe(`kinds/${loc.org}/${loc.name}`);
    expect(contentPrefix).toBe(`kinds/${loc.org}/${loc.name}/${version}`);
  });

  test("npmNameToKindPath delegates to parsePackageName (scope dropped, 1st dotted segment = org, 2nd = name, .kind ignored)", () => {
    // Scoped form: the npm scope (`@platforma-open/`) is dropped, then the dotted
    // body yields org = 1st segment, name = 2nd, and the trailing `.kind` marker
    // is simply not matched by the canonical parser.
    expect(npmNameToKindPath("@platforma-open/milaboratories.mixcr-clonotyping.kind")).toEqual({
      org: "milaboratories",
      name: "mixcr-clonotyping",
    });
    // Bare dotted form: org = 1st segment, name = 2nd, `.kind` ignored.
    expect(npmNameToKindPath("platforma-open.mixcr-clonotyping.kind")).toEqual({
      org: "platforma-open",
      name: "mixcr-clonotyping",
    });
    // Delegation means the derivation is identical whether or not the `.kind`
    // marker is present — the trailing segment never participates in the split.
    expect(npmNameToKindPath("@platforma-open/milaboratories.mixcr-clonotyping")).toEqual(
      npmNameToKindPath("@platforma-open/milaboratories.mixcr-clonotyping.kind"),
    );
  });
});
