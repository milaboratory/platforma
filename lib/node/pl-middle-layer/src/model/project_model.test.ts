import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { parseProjectField, ProjectField, projectFieldName } from "./project_model";

test("project field parsing test", () => {
  const field: ProjectField = { fieldName: "stagingCtx", blockId: randomUUID() };
  const fieldName = projectFieldName(field.blockId, field.fieldName);
  expect(parseProjectField(fieldName)).toStrictEqual(field);
});

test.each([
  "currentArgs",
  "currentArgsIssues",
  "currentDraftArgs",
  "currentPrerunArgs",
  "currentPrerunArgsIssues",
  "currentDraftPrerunArgs",
  "stagingArgs",
  "stagingCtx",
] satisfies ProjectField["fieldName"][])("field %s is parsed as itself", (fieldName) => {
  const blockId = randomUUID();
  expect(parseProjectField(projectFieldName(blockId, fieldName))).toStrictEqual({
    blockId,
    fieldName,
  });
});
