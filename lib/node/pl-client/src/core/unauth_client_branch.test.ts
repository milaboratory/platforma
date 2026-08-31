import { test, expect, vi } from "vitest";
import { UnauthenticatedPlClient } from "./unauth_client";
import type { BackendCapability } from "./capabilities";
import {
  AuthAPI_ListMethods_SSOAuthMethod_FlowType,
  type AuthAPI_ListMethods_Response,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";

type Scheme = "basic" | "token" | "none";
type MethodInfo = AuthAPI_ListMethods_Response["methods"][number];

function makeStub(opts: { hasAuthV2: boolean; scheme?: Scheme; methods?: MethodInfo[] }) {
  const scheme = opts.scheme ?? "basic";
  const methods =
    opts.methods ??
    (scheme === "basic"
      ? [{ id: "basic", method: { oneofKind: "basic", basic: {} } }]
      : scheme === "token"
        ? [{ id: "token", method: { oneofKind: "token", token: {} } }]
        : []);
  const ll = {
    hasCapability: vi.fn(
      (capability: BackendCapability) => capability === "auth:v2" && opts.hasAuthV2,
    ),
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
  expect(client.hasCapability("auth:v2")).toBe(true);
  expect(client.hasCapability("treeFilter:v2")).toBe(false);
  expect(ll.hasCapability).toHaveBeenCalledWith("auth:v2");
});

function ssoMethod(overrides: {
  id: string;
  description: string;
  issuer: string;
  flowType?: AuthAPI_ListMethods_SSOAuthMethod_FlowType;
}): MethodInfo {
  return {
    id: overrides.id,
    description: overrides.description,
    method: {
      oneofKind: "sso",
      sso: {
        issuer: overrides.issuer,
        clientId: "client-id",
        scopes: "openid",
        resource: "",
        prompt: "",
        redirectPorts: [12345],
        subjectTokenSource: "id_token",
        userIdClaim: "sub",
        groupsClaim: "",
        flowType: overrides.flowType ?? AuthAPI_ListMethods_SSOAuthMethod_FlowType.PUBLIC_PKCE,
        accessType: undefined,
      },
    },
  };
}

test("ssoConfig returns the first sso method and drops the rest", () => {
  const first = ssoMethod({ id: "sso-first", description: "First IdP", issuer: "https://first.example" });
  const second = ssoMethod({ id: "sso-second", description: "Second IdP", issuer: "https://second.example" });
  const { client } = makeStub({ hasAuthV2: true, methods: [first, second] });

  const sso = client.ssoConfig();

  expect(sso).toMatchObject({
    id: "sso-first",
    description: "First IdP",
    issuer: "https://first.example",
  });
});

test("ssoConfig carries id and description onto the returned SSOAuthMethod", () => {
  const method = ssoMethod({ id: "sso-1", description: "Corp SSO", issuer: "https://idp.example" });
  const { client } = makeStub({ hasAuthV2: true, methods: [method] });

  const sso = client.ssoConfig();

  expect(sso?.id).toBe("sso-1");
  expect(sso?.description).toBe("Corp SSO");
});

test("ssoConfig throws when the sso method's flow type is not PUBLIC_PKCE", () => {
  const method = ssoMethod({
    id: "sso-1",
    description: "Corp SSO",
    issuer: "https://idp.example",
    // 99 is not a defined FlowType value; casts an out-of-range value the
    // proto currently has none for, to pin the guard against a future flow.
    flowType: 99 as AuthAPI_ListMethods_SSOAuthMethod_FlowType,
  });
  const { client } = makeStub({ hasAuthV2: true, methods: [method] });

  expect(() => client.ssoConfig()).toThrow("ssoConfig: unsupported SSO flow type");
});

test("supportedAuthSchemes collapses a basic+token+sso method list to scheme booleans", () => {
  const methods: MethodInfo[] = [
    { id: "basic", description: "", method: { oneofKind: "basic", basic: {} } },
    { id: "token", description: "", method: { oneofKind: "token", token: {} } },
    ssoMethod({ id: "sso-1", description: "Corp SSO", issuer: "https://idp.example" }),
  ];
  const { client } = makeStub({ hasAuthV2: true, methods });

  expect(client.supportedAuthSchemes).toEqual({ basic: true, token: true });
});
