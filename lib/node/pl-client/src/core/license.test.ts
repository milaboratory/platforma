import { getTestClient } from "../test/test_config";
import { decodeLicenseToken, type LicensePayload } from "./license";
import { test, expect } from "vitest";

/**
 * Fetches the license token from a live backend, decodes it, and checks that the
 * required {@link LicensePayload} fields are always populated.
 *
 * This doubles as an investigation surface: point it at any backend via
 * `PL_ADDRESS` / `PL_TEST_USER` / `PL_TEST_PASSWORD` and read the logged payload
 * (notably `e`, the expiration timestamp) to inspect that backend's license.
 */
test("license payload carries all required fields", async () => {
  const client = await getTestClient();

  const resp = await client.license();
  expect(resp.isOk).toBe(true);

  // `responseBody` is the raw licensing-server body: a JSON-encoded token string.
  const token = JSON.parse(Buffer.from(resp.responseBody).toString("utf8")) as string;

  // decodeLicenseToken() itself asserts required fields are present and well-typed;
  // an incomplete license from the backend would throw here.
  const payload: LicensePayload = decodeLicenseToken(token);

  // Explicit expectations mirror the required fields of LicensePayload, kept here
  // so the contract is visible and easy to extend for future investigations.
  expect(typeof payload.v).toBe("number");
  expect(typeof payload.e).toBe("number");
  expect(typeof payload.u).toBe("string");
  expect(payload.u.length).toBeGreaterThan(0);
  expect(typeof payload.m).toBe("string");

  // Expiration must come after the valid-from moment.
  expect(payload.e).toBeGreaterThan(payload.v);

  console.log("license payload:", JSON.stringify(payload, null, 2));
  console.log("valid from:", new Date(payload.v * 1000).toISOString());
  console.log("expires at:", new Date(payload.e * 1000).toISOString());
  if (payload.w !== undefined) {
    console.log("warn after:", new Date(payload.w * 1000).toISOString());
  }
});
