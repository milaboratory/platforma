import { expect, test } from "vitest";
import { PlErrorReport } from "./parsed_error";
import { ensureErrorLike } from "./error_like_shape";

test('pl error report is error like shape', () => {
  const plErrorReport = new PlErrorReport('test error report', '', '', []);

  const got = ensureErrorLike(plErrorReport);

  expect(got).toBeDefined();
});
