import { expect, describe, test } from "vitest";
import { dropImportLines, findUnusedImports } from "./imports";
import { createLogger } from "./util";

const logger = createLogger("error");

const unusedAliases = (src: string, localPackageName = "current-package"): string[] =>
  findUnusedImports(logger, src, localPackageName, "test.lib.tengo").map((im) => im.alias);

describe("findUnusedImports", () => {
  test("keeps an import the code uses", () => {
    const src = `ll := import(":ll")

doSomething := func() {
	ll.assert(true, "always")
}
`;
    expect(unusedAliases(src)).toEqual([]);
  });

  test("reports an import nothing uses", () => {
    const src = `ll := import(":ll")
sets := import(":sets")

doSomething := func() {
	ll.assert(true, "always")
}
`;
    expect(unusedAliases(src)).toEqual(["sets"]);
  });

  test("reports standard library imports too", () => {
    const src = `json := import("json")
text := import("text")

doSomething := func(s) {
	return text.split(s, ",")
}
`;
    expect(unusedAliases(src)).toEqual(["json"]);
  });

  test("a single line comment is not a usage", () => {
    const src = `validation := import(":validation")

doSomething := func(spec) {
	// @TODO fix validation
	// validation.assertValidJson(spec, schema)
	return spec
}
`;
    expect(unusedAliases(src)).toEqual(["validation"]);
  });

  test("a comment block is not a usage", () => {
    const src = `maps := import(":maps")

/*
	maps.clone(m) is what this used to do.
*/
doSomething := func(m) {
	return m
}
`;
    expect(unusedAliases(src)).toEqual(["maps"]);
  });

  test("a compiler option line is not a usage", () => {
    const src = `//tengo:hash_override 8ad4b0c4-1f31-4c4a-9b53-c2e50d2f0d9e
ll := import(":ll")

doSomething := func() {
	return 1
}
`;
    expect(unusedAliases(src)).toEqual(["ll"]);
  });

  test("a longer name that ends with the alias is not a usage", () => {
    const src = `ll := import(":ll")

doSomething := func(xll) {
	return xll.value
}
`;
    expect(unusedAliases(src)).toEqual(["ll"]);
  });

  test("a usage inside a multiline statement counts", () => {
    const src = `ll := import(":ll")
exec := import(":exec")

doSomething := func() {
	return exec.builder().
		cmd(ll.toStrings(["a"])).
		run()
}
`;
    expect(unusedAliases(src)).toEqual([]);
  });

  test("a module the code only passes around counts as unused", () => {
    // We ask for the dot on purpose: keeping an import too long costs
    // nothing, dropping one the source needs breaks the build.
    const src = `text := import("text")

doSomething := func() {
	return apply(text)
}
`;
    expect(unusedAliases(src)).toEqual(["text"]);
  });

  test("reports the line of each import", () => {
    const src = `ll := import(":ll")
sets := import(":sets")
`;
    expect(findUnusedImports(logger, src, "current-package", "test.lib.tengo")).toEqual([
      { alias: "ll", module: ":ll", lineNo: 0 },
      { alias: "sets", module: ":sets", lineNo: 1 },
    ]);
  });

  test("a source without imports gives nothing", () => {
    expect(unusedAliases("doSomething := func() { return 1 }\n")).toEqual([]);
  });

  test("throws with the source name and the line for a source it cannot parse", () => {
    const src = `assets := import("@platforma-sdk/workflow-tengo:assets")

softwareName := "sw:main"
sw := assets.importSoftware(softwareName)
`;
    expect(() => unusedAliases(src)).toThrow("[line 4 in test.lib.tengo]");
  });
});

describe("dropImportLines", () => {
  test("removes only the given lines", () => {
    const src = `ll := import(":ll")
sets := import(":sets")

doSomething := func() {
	ll.assert(true, "always")
}
`;
    expect(dropImportLines(src, [1])).toEqual(`ll := import(":ll")

doSomething := func() {
	ll.assert(true, "always")
}
`);
  });

  test("keeps comments, blank lines and the trailing newline", () => {
    const src = `// header comment

json := import("json")

/* a block
   comment */
doSomething := func() {
	return 1
}
`;
    expect(dropImportLines(src, [2])).toEqual(`// header comment


/* a block
   comment */
doSomething := func() {
	return 1
}
`);
  });

  test("keeps the source as it is when there is nothing to remove", () => {
    const src = `ll := import(":ll")\n`;
    expect(dropImportLines(src, [])).toEqual(src);
  });
});
