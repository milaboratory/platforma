import { UnauthenticatedPlClient } from "./unauth_client";
import { getTestConfig, plAddressToTestConfig } from "../test/test_config";
import { UnauthenticatedError, isUnimplementedError } from "./errors";
import { test, expect } from "vitest";

test("ping test", async () => {
  const client = await UnauthenticatedPlClient.build(
    plAddressToTestConfig(getTestConfig().address),
  );
  const response = await client.ping();
  expect(response).toHaveProperty("coreVersion");
});

test("get auth methods", async () => {
  const client = await UnauthenticatedPlClient.build(
    plAddressToTestConfig(getTestConfig().address),
  );
  const response = await client.authMethods();
  expect(response).toHaveProperty("methods");
});

test("wrong login", async () => {
  const testConfig = getTestConfig();
  if (testConfig.test_user === undefined || testConfig.test_password === undefined) {
    console.log("skipped");
    return;
  }
  const client = await UnauthenticatedPlClient.build(plAddressToTestConfig(testConfig.address));
  await expect(client.login(testConfig.test_user, testConfig.test_password + "A")).rejects.toThrow(
    UnauthenticatedError,
  );
});

// --- multi-method login ---
//
// These cases assume the backend is configured with (at least) two htpasswd
// login methods whose config `name` values differ but which both accept the
// same PL_TEST_USER/PL_TEST_PASSWORD credentials — the id
// is the only thing distinguishing them.

/** Runs every multi-method case against one client, gRPC or REST alike. */
async function runMultiMethodCases(address: string) {
  const testConfig = getTestConfig();
  if (testConfig.test_user === undefined || testConfig.test_password === undefined) {
    console.log("skipped");
    return;
  }
  const client = await UnauthenticatedPlClient.build(plAddressToTestConfig(address));

  const basicMethods = client.loginMethods().filter((m) => m.kind === "basic");
  expect(basicMethods.length).toBeGreaterThanOrEqual(2);
  // The driver's fixed description is the same string on every htpasswd method — only
  // the id tells the two apart.
  expect(basicMethods[0].description).toBe(basicMethods[1].description);
  expect(basicMethods[0].id).not.toBe(basicMethods[1].id);

  expect(client.supportedAuthSchemes.basic).toBe(true);

  const secondMethod = basicMethods[1];
  const picked = await client.login(
    testConfig.test_user,
    testConfig.test_password,
    secondMethod.id,
  );
  expect(picked.jwtToken).not.toBe("");

  const unpicked = await client.login(testConfig.test_user, testConfig.test_password);
  expect(unpicked.jwtToken).not.toBe("");

  await expect(
    client.login(testConfig.test_user, testConfig.test_password, "no-such-method"),
  ).rejects.toThrow();
}

// Skipped: this environment's backend cannot be configured with two htpasswd login methods.
test.skip("loginMethods and login address two identically-described htpasswd methods by id (gRPC)", async () => {
  const testConfig = getTestConfig();
  await runMultiMethodCases(testConfig.address);
});

// Skipped: this environment's backend cannot be configured with two htpasswd login methods.
test.skip("loginMethods and login address two identically-described htpasswd methods by id (REST)", async () => {
  const testConfig = getTestConfig();
  const separator = testConfig.address.includes("?") ? "&" : "?";
  await runMultiMethodCases(`${testConfig.address}${separator}wire-protocol=rest`);
});

test("beginSSOLogin rejects an id no configured method carries, and reports no SSO configured when unpicked", async () => {
  const testConfig = getTestConfig();
  const client = await UnauthenticatedPlClient.build(plAddressToTestConfig(testConfig.address));

  await expect(client.beginSSOLogin("no-such-method")).rejects.toThrow();

  try {
    await client.beginSSOLogin();
    throw new Error("expected beginSSOLogin() to reject on a server with no SSO method configured");
  } catch (e) {
    expect(isUnimplementedError(e)).toBe(true);
  }
});
