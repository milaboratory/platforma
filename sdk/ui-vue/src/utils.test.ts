import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { createModel } from "./createModel";
import { formatSchemaIssues } from "./utils";

// Issues and messages as Zod 3.25.76 reports them; the expected strings are its `flatten()` format.
const zodFieldIssues = [
  { path: ["name"], message: "Expected string, received number" },
  { path: ["count"], message: "Expected integer, received float" },
  { path: ["tags", 1], message: "Expected string, received number" },
];
const zodFormIssues = [{ path: [], message: "Expected object, received string" }];
const zodFieldMessage =
  "name:Expected string, received number; count:Expected integer, received float; tags:Expected string, received number";

describe("formatSchemaIssues", () => {
  test("matches the ZodError flatten format", () => {
    expect(formatSchemaIssues(zodFieldIssues)).toBe(zodFieldMessage);
    expect(formatSchemaIssues(zodFormIssues)).toBe("Expected object, received string");
  });

  test("reads keys from path segment objects", () => {
    expect(
      formatSchemaIssues([
        { message: "Invalid input" },
        { message: "Too short", path: [{ key: "name" }] },
        { message: "Not a number", path: [{ key: "count" }, "inner"] },
        { message: "Empty", path: [{ key: "name" }] },
      ]),
    ).toBe("Invalid input; name:Too short,Empty; count:Not a number");
  });
});

describe("createModel", () => {
  const errorMessage = (cause: unknown) => {
    const model = createModel({ get: () => ({}), onSave: () => {} });
    model.setError(cause);
    return model.errorString;
  };

  test("formats errors of Standard Schema libraries", () => {
    const zodError = Object.assign(new Error("[]"), { name: "ZodError", issues: zodFieldIssues });
    const valiError = new v.ValiError(
      v.safeParse(v.object({ name: v.pipe(v.string(), v.minLength(2)) }), { name: "a" }).issues!,
    );
    expect(errorMessage(zodError)).toBe(zodFieldMessage);
    expect(errorMessage(valiError)).toBe("name:Invalid length: Expected >=2 but received 1");
  });

  test("keeps the message of other errors", () => {
    expect(errorMessage(new Error("plain"))).toBe("plain");
    expect(errorMessage(Object.assign(new Error("empty"), { issues: [] }))).toBe("empty");
    expect(errorMessage(Object.assign(new Error("other"), { issues: [1] }))).toBe("other");
  });
});
