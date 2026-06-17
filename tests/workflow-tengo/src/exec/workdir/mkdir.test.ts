import { tplTest } from "@platforma-sdk/test";

/**
 * MILAB-6460: exec/workdir builder mkDir must create real nested directories,
 * not a single directory literally named ["embeddings"] / ["a", "a/b", "a/b/c"].
 *
 * The template creates "embeddings" and "a/b/c" via mkDir, then prints
 * ok:<dir> / missing:<dir> for each expected directory plus a top-level listing.
 */
tplTest.concurrent(
  "exec.builder.mkDir creates real nested directories (MILAB-6460)",
  async ({ helper, expect }) => {
    const result = await helper.renderTemplate(
      false,
      "exec.workdir.mkdir",
      ["dirs"],
      () => ({}),
    );

    const listing = await result
      .computeOutput("dirs", (a) => a?.getDataAsString())
      .awaitStableValue();

    expect(listing).toBeTypeOf("string");

    const lines = (listing as string)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    // Every path component exists as its own directory.
    expect(lines).toContain("ok:embeddings");
    expect(lines).toContain("ok:a");
    expect(lines).toContain("ok:a/b");
    expect(lines).toContain("ok:a/b/c");

    // None of the expected directories are missing ...
    expect(listing).not.toMatch(/missing:/);
    // ... and no directory was created with the bug's bracketed literal name.
    expect(listing).not.toContain("[");
    expect(listing).not.toContain("]");
  },
);
