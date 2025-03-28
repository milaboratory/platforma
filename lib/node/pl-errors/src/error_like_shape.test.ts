import { expect, test } from "vitest";
import { PlErrorReport } from "./parsed_error";
import { ensureErrorLike } from "@milaboratories/pl-error-like";

test('pl error report has error like shape', () => {
  const plErrorReport = new PlErrorReport('test error report', '', '', []);

  const got = ensureErrorLike(plErrorReport);

  expect(got).toBeDefined();
});
