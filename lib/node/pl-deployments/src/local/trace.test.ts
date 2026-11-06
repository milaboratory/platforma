import { test, expect } from "vitest";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { withTrace } from "./trace";

test("withTrace logs a failed operation's trace without secrets", async () => {
  const errors: string[] = [];
  const logger: MiLogger = {
    info: () => {},
    warn: () => {},
    error: (msg) => errors.push(String(msg)),
  };

  await expect(
    withTrace(logger, async (trace) => {
      trace("startOptions", {
        workingDir: "/tmp/pl",
        proxy: { url: "http://proxy", auth: "u:p4ss" },
      });
      trace("jwt", "jwt-value");
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");

  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("boom");
  expect(errors[0]).toContain("/tmp/pl");
  expect(errors[0]).not.toContain("u:p4ss");
  expect(errors[0]).not.toContain("jwt-value");
});
