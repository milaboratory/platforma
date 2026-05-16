import { test, expect, vi } from "vitest";
import { UnauthenticatedPlClient } from "./unauth_client";
import { CapabilityAuthV2 } from "./capabilities";

type Scheme = "basic" | "token" | "none";

function makeStub(opts: { hasAuthV2: boolean; scheme?: Scheme }) {
  const scheme = opts.scheme ?? "basic";
  const methods =
    scheme === "basic"
      ? [{ id: "basic", method: { oneofKind: "basic", basic: {} } }]
      : scheme === "token"
        ? [{ id: "token", method: { oneofKind: "token", token: {} } }]
        : [];
  const ll = {
    hasCapability: vi.fn((name: string) => name === CapabilityAuthV2 && opts.hasAuthV2),
    loginBasic: vi.fn().mockResolvedValue("jwt-from-loginBasic"),
    loginWithToken: vi.fn().mockResolvedValue("jwt-from-loginWithToken"),
    getJwtToken: vi.fn().mockResolvedValue("jwt-from-getJwtToken"),
    authMethodsSync: { methods },
    conf: { authTTLSeconds: 100 },
  };
  const client = Object.assign(Object.create(UnauthenticatedPlClient.prototype) as object, { ll });
  return { client: client as UnauthenticatedPlClient, ll };
}

test("login routes to loginBasic when backend advertises auth:v2 + basic scheme", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "basic" });

  const info = await client.login("alice", "pw");

  expect(ll.loginBasic).toHaveBeenCalledWith("alice", "pw");
  expect(ll.loginWithToken).not.toHaveBeenCalled();
  expect(ll.getJwtToken).not.toHaveBeenCalled();
  expect(info.jwtToken).toBe("jwt-from-loginBasic");
});

test("login routes to loginWithToken when backend advertises auth:v2 + token-only scheme", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "token" });

  const info = await client.login("alice", "opaque-token");

  expect(ll.loginWithToken).toHaveBeenCalledWith("opaque-token");
  expect(ll.loginBasic).not.toHaveBeenCalled();
  expect(ll.getJwtToken).not.toHaveBeenCalled();
  expect(info.jwtToken).toBe("jwt-from-loginWithToken");
});

test("login falls back to getJwtToken when backend lacks auth:v2", async () => {
  const { client, ll } = makeStub({ hasAuthV2: false });

  const info = await client.login("alice", "pw");

  expect(ll.getJwtToken).toHaveBeenCalledWith(BigInt(100), {
    authorization: expect.stringMatching(/^Basic /),
  });
  expect(ll.loginBasic).not.toHaveBeenCalled();
  expect(ll.loginWithToken).not.toHaveBeenCalled();
  expect(info.jwtToken).toBe("jwt-from-getJwtToken");
});

test("hasCapability proxies to underlying LLPlClient", () => {
  const { client, ll } = makeStub({ hasAuthV2: true });
  expect(client.hasCapability(CapabilityAuthV2)).toBe(true);
  expect(client.hasCapability("nope:v0")).toBe(false);
  expect(ll.hasCapability).toHaveBeenCalledWith(CapabilityAuthV2);
});
