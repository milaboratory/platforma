import { describe, expect, test } from "vitest";
import { formatKindRef } from "@milaboratories/pl-model-common";
import { checkKindVersionMatch, KindVersionMismatchError } from "./version-match";

/**
 * `checkKindVersionMatch` is the pure pre-publish gate: the model's
 * compiled-against kind and the facade's declared kind must be the SAME kind at
 * the SAME version. Success is "did not throw". The full `{org, name}` identity is
 * compared, not just the terminal name.
 */
describe("checkKindVersionMatch", () => {
  const name = "@platforma-open/milaboratories.demo.kind";

  test("identical name + version passes", () => {
    expect(() =>
      checkKindVersionMatch(
        formatKindRef({ name, version: "1.2.3" }),
        formatKindRef({ name, version: "1.2.3" }),
      ),
    ).not.toThrow();
  });

  test("same kind, different version -> version mismatch", () => {
    expect(() =>
      checkKindVersionMatch(
        formatKindRef({ name, version: "1.2.3" }),
        formatKindRef({ name, version: "1.2.4" }),
      ),
    ).toThrow(KindVersionMismatchError);
  });

  test("different name segment at the same version -> name mismatch", () => {
    expect(() =>
      checkKindVersionMatch(
        formatKindRef({ name: "@platforma-open/milaboratories.demo.kind", version: "1.2.3" }),
        formatKindRef({ name: "@platforma-open/milaboratories.other.kind", version: "1.2.3" }),
      ),
    ).toThrow(KindVersionMismatchError);
  });

  test("different org at the same version -> name mismatch (org IS compared)", () => {
    expect(() =>
      checkKindVersionMatch(
        formatKindRef({ name: "@platforma-open/milaboratories.demo.kind", version: "1.2.3" }),
        formatKindRef({ name: "@platforma-open/acme.demo.kind", version: "1.2.3" }),
      ),
    ).toThrow(KindVersionMismatchError);
  });

  test("an incidental npm-scope difference is normalized away", () => {
    // Scoped vs. bare npm name: `npmNameToKindPath` drops the scope, so both
    // resolve to the same `{org, name}` and the same kind matches.
    expect(() =>
      checkKindVersionMatch(
        formatKindRef({ name: "@platforma-open/milaboratories.demo.kind", version: "1.2.3" }),
        formatKindRef({ name: "milaboratories.demo.kind", version: "1.2.3" }),
      ),
    ).not.toThrow();
  });
});
