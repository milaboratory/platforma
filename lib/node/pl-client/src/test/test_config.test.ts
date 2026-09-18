import { getTestClientConf, plAddressToTestConfig, TEST_REQUEST_TIMEOUT } from "./test_config";
import { test, expect } from "vitest";

test("test that test config have no alternative root set", async () => {
  const { conf } = await getTestClientConf();
  expect(conf.alternativeRoot).toBeUndefined();
});

test("address request-timeout survives the test config", () => {
  expect(
    plAddressToTestConfig("http://pl.example:6345?request-timeout=3000").defaultRequestTimeout,
  ).toBe(3000);
});

test("address without request-timeout takes the test one", () => {
  expect(plAddressToTestConfig("http://pl.example:6345").defaultRequestTimeout).toBe(
    TEST_REQUEST_TIMEOUT,
  );
  expect(plAddressToTestConfig("pl.example:6345").defaultRequestTimeout).toBe(TEST_REQUEST_TIMEOUT);
});
