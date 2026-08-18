import { describe, expect, test } from "vitest";
import type {
  BlockKindReference,
  BlockKindSelectorReference,
} from "@milaboratories/pl-model-common";
import { kindMismatch } from "./template_apply";

/**
 * Whether the block prepared for an entry is the block that entry meant.
 *
 * Tested directly rather than through `applyTemplateToProject`, which needs a backend to
 * prepare a block pack at all. It is a pure function for exactly that reason: the question
 * does not need a project, and keeping it answerable without one is what makes it testable.
 */

const ASKED = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;
const declares = (ref: string) => ref as BlockKindReference;

describe("kindMismatch", () => {
  test("a version inside the asked range serves the entry", () => {
    const declared = declares("@platforma-open/milaboratories.demo.kind@1.4.0");

    expect(kindMismatch(ASKED, declared)).toBeUndefined();
  });

  test("a version outside it does not, and the message names both sides", () => {
    const message = kindMismatch(ASKED, declares("@platforma-open/milaboratories.demo.kind@2.0.0"));

    expect(message).toContain("@platforma-open/milaboratories.demo.kind@^1.0.0");
    expect(message).toContain("version 2.0.0");
  });

  test("a different kind entirely is refused by name", () => {
    // What a location makes possible: the path still resolves, but what is there now is a
    // different block than the one the params were written for.
    const message = kindMismatch(
      ASKED,
      declares("@platforma-open/milaboratories.other.kind@1.0.0"),
    );

    expect(message).toContain("@platforma-open/milaboratories.demo.kind");
    expect(message).toContain("@platforma-open/milaboratories.other.kind");
  });

  test("a block declaring no kind cannot serve an entry that names one", () => {
    // Reachable through a pinned version, which names a package and says nothing about
    // kinds — so the block it names may well be one built before kinds existed.
    expect(kindMismatch(ASKED, undefined)).toMatch(/declares no kind/);
  });

  test("an unreadable declaration is refused rather than thrown", () => {
    // The entry's own selector was checked when the document was parsed, so a failure here
    // is the block's stored reference. One bad block must not break the whole apply.
    expect(kindMismatch(ASKED, declares("no-version-here"))).toMatch(/unreadable kind/);
  });

  test("the message names no route, so the caller can name the one the entry took", () => {
    // The check is asked once, of the prepared block, whichever of the three routes found
    // it. Only the caller knows whether there is a locator to point the reader at.
    const message = kindMismatch(ASKED, undefined)!;

    expect(message).not.toContain("file:");
    expect(message).not.toContain("location");
  });
});
