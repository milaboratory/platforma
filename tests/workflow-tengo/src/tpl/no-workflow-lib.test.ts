import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { Templates } from "@platforma-sdk/workflow-tengo";
import { describe, expect, test } from "vitest";

// :workflow calls defineOutputs on import. Modules are evaluated once per run, so a template
// that bundles it, even through a library, inherits the workflow's outputs and fails the
// "tpl.body() callback must return the same list of outputs" check.
const WORKFLOW_LIB = "@platforma-sdk/workflow-tengo:workflow";

describe("SDK templates do not bundle :workflow", () => {
  test.each(Object.entries(Templates))("%s", (_name, tpl) => {
    const compiled = JSON.parse(gunzipSync(readFileSync(tpl.path)).toString("utf8")) as {
      template: { libs: Record<string, unknown> };
    };
    expect(Object.keys(compiled.template.libs)).not.toContain(WORKFLOW_LIB);
  });
});
