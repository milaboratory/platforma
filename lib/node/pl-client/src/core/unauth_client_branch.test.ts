import { test, expect, vi } from "vitest";
import { UnauthenticatedPlClient } from "./unauth_client";
import { LLPlClient } from "./ll_client";
import { PlatformClient as GrpcPlApiClient } from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api.client";
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
    beginSSOLogin: vi.fn().mockResolvedValue({ nonce: "nonce", expiresAt: new Date() }),
    loginSSO: vi.fn().mockResolvedValue("jwt-from-loginSSO"),
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
  clientId?: string;
  scopes?: string;
  resource?: string;
  prompt?: string;
  redirectPorts?: number[];
  subjectTokenSource?: string;
  userIdClaim?: string;
  groupsClaim?: string;
  accessType?: string;
}): MethodInfo {
  return {
    id: overrides.id,
    description: overrides.description,
    method: {
      oneofKind: "sso",
      sso: {
        issuer: overrides.issuer,
        clientId: overrides.clientId ?? "client-id",
        scopes: overrides.scopes ?? "openid",
        resource: overrides.resource ?? "",
        prompt: overrides.prompt ?? "",
        redirectPorts: overrides.redirectPorts ?? [12345],
        subjectTokenSource: overrides.subjectTokenSource ?? "id_token",
        userIdClaim: overrides.userIdClaim ?? "sub",
        groupsClaim: overrides.groupsClaim ?? "",
        flowType: overrides.flowType ?? AuthAPI_ListMethods_SSOAuthMethod_FlowType.PUBLIC_PKCE,
        accessType: overrides.accessType,
      },
    },
  };
}

function basicMethod(id: string, description = "Basic auth"): MethodInfo {
  return { id, description, method: { oneofKind: "basic", basic: {} } };
}

function tokenMethod(id: string, description = "Static token"): MethodInfo {
  return { id, description, method: { oneofKind: "token", token: {} } };
}

// --- loginMethods() ---

test("loginMethods lists every advertised method, of every kind, in advertised order", () => {
  const methods: MethodInfo[] = [
    ssoMethod({ id: "sso-a", description: "First IdP", issuer: "https://first.example" }),
    ssoMethod({ id: "sso-b", description: "Second IdP", issuer: "https://second.example" }),
    basicMethod("htpasswd-a", "htpasswd"),
    basicMethod("htpasswd-b", "htpasswd"),
    tokenMethod("token-a", "static token"),
  ];
  const { client } = makeStub({ hasAuthV2: true, methods });

  const listed = client.loginMethods();

  expect(listed.map((m) => m.kind)).toEqual(["sso", "sso", "basic", "basic", "token"]);
  expect(listed.map((m) => m.id)).toEqual([
    "sso-a",
    "sso-b",
    "htpasswd-a",
    "htpasswd-b",
    "token-a",
  ]);
});

test("loginMethods keeps same-kind methods distinct while supportedAuthSchemes still collapses them", () => {
  const methods: MethodInfo[] = [
    basicMethod("htpasswd-a", "htpasswd"),
    basicMethod("htpasswd-b", "htpasswd"),
    tokenMethod("token-a"),
  ];
  const { client } = makeStub({ hasAuthV2: true, methods });

  const listed = client.loginMethods().filter((m) => m.kind === "basic");

  expect(listed.map((m) => m.id)).toEqual(["htpasswd-a", "htpasswd-b"]);
  expect(client.supportedAuthSchemes).toEqual({ basic: true, token: true });
});

test("loginMethods maps every field of an SSO projection, and drops an empty accessType", () => {
  const method = ssoMethod({
    id: "sso-1",
    description: "Corp SSO",
    issuer: "https://idp.example",
    clientId: "the-client-id",
    scopes: "openid profile",
    resource: "https://api.example",
    prompt: "consent",
    redirectPorts: [11000, 11001],
    subjectTokenSource: "access_token",
    userIdClaim: "email",
    groupsClaim: "groups",
    accessType: "",
  });
  const { client } = makeStub({ hasAuthV2: true, methods: [method] });

  const [entry] = client.loginMethods();

  expect(entry).toEqual({
    kind: "sso",
    id: "sso-1",
    description: "Corp SSO",
    issuer: "https://idp.example",
    clientId: "the-client-id",
    scopes: "openid profile",
    resource: "https://api.example",
    prompt: "consent",
    redirectPorts: [11000, 11001],
    subjectTokenSource: "access_token",
    userIdClaim: "email",
    groupsClaim: "groups",
    flowType: "public_pkce",
    accessType: undefined,
  });
});

test("loginMethods drops an advertised method with no usable arm", () => {
  const armless: MethodInfo = { id: "legacy", description: "", method: { oneofKind: undefined } };
  const { client } = makeStub({ hasAuthV2: true, methods: [armless, basicMethod("htpasswd-a")] });

  expect(client.loginMethods().map((m) => m.id)).toEqual(["htpasswd-a"]);
});

test("loginMethods drops an SSO entry whose flow type is unsupported, keeping every other entry", () => {
  const unsupported = ssoMethod({
    id: "sso-legacy",
    description: "Corp SSO",
    issuer: "https://idp.example",
    flowType: 99 as AuthAPI_ListMethods_SSOAuthMethod_FlowType,
  });
  const { client } = makeStub({
    hasAuthV2: true,
    methods: [unsupported, basicMethod("htpasswd-a")],
  });

  expect(client.loginMethods().map((m) => m.id)).toEqual(["htpasswd-a"]);
});

test("beginSSOLogin forwards the picked id to the low-level client", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "none" });

  await client.beginSSOLogin("sso-a");

  expect(ll.beginSSOLogin).toHaveBeenCalledWith("sso-a");
});

test("beginSSOLogin omits the argument when no id is picked", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "none" });

  await client.beginSSOLogin();

  expect(ll.beginSSOLogin).toHaveBeenCalledWith();
});

test("loginSSO carries the picked id to the low-level client alongside the token response", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "none" });
  const tokenResponse = new Uint8Array([1, 2, 3]);

  await client.loginSSO({ tokenResponse, idP: "sso-a" });

  expect(ll.loginSSO).toHaveBeenCalledWith(tokenResponse, "sso-a");
});

test("loginSSO sends only the token response when no id is picked", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "none" });
  const tokenResponse = new Uint8Array([1, 2, 3]);

  await client.loginSSO({ tokenResponse });

  expect(ll.loginSSO).toHaveBeenCalledWith(tokenResponse);
});

test("login forwards the picked id into loginBasic's options bag", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "basic" });

  await client.login("alice", "pw", "htpasswd-b");

  expect(ll.loginBasic).toHaveBeenCalledWith("alice", "pw", { idP: "htpasswd-b" });
});

test("login drops the picked id on the token branch", async () => {
  const { client, ll } = makeStub({ hasAuthV2: true, scheme: "token" });

  const info = await client.login("alice", "opaque-token", "some-id");

  expect(ll.loginWithToken).toHaveBeenCalledWith("opaque-token");
  expect(info.jwtToken).toBe("jwt-from-loginWithToken");
});

test("ssoConfig returns the first sso method and drops the rest", () => {
  const first = ssoMethod({
    id: "sso-first",
    description: "First IdP",
    issuer: "https://first.example",
  });
  const second = ssoMethod({
    id: "sso-second",
    description: "Second IdP",
    issuer: "https://second.example",
  });
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

// --- LLPlClient.loginBasic carries the id on both transports ---

function makeLLStub(cl: { login?: ReturnType<typeof vi.fn>; POST?: ReturnType<typeof vi.fn> }) {
  return Object.assign(Object.create(LLPlClient.prototype) as object, {
    clientProvider: { get: () => cl },
    conf: { authTTLSeconds: 100 },
  }) as LLPlClient;
}

test("loginBasic carries idP in the request body on the gRPC transport", async () => {
  const login = vi.fn(() => ({ response: Promise.resolve({ token: "jwt" }) }));
  const cl = Object.assign(Object.create(GrpcPlApiClient.prototype) as object, { login });
  const ll = makeLLStub(cl);

  await ll.loginBasic("alice", "pw", { idP: "htpasswd-b" });

  expect(login).toHaveBeenCalledWith(
    expect.objectContaining({
      credentials: {
        oneofKind: "basic",
        basic: { login: "alice", password: "pw", idp: "htpasswd-b" },
      },
    }),
    expect.anything(),
  );
});

test("loginBasic without idP produces the same gRPC request body as today", async () => {
  const login = vi.fn(() => ({ response: Promise.resolve({ token: "jwt" }) }));
  const cl = Object.assign(Object.create(GrpcPlApiClient.prototype) as object, { login });
  const ll = makeLLStub(cl);

  await ll.loginBasic("alice", "pw");

  expect(login).toHaveBeenCalledWith(
    expect.objectContaining({
      credentials: { oneofKind: "basic", basic: { login: "alice", password: "pw" } },
    }),
    expect.anything(),
  );
});

test("loginBasic carries idP in the request body on the REST transport", async () => {
  const POST = vi.fn(() => Promise.resolve({ data: { token: "jwt" } }));
  const ll = makeLLStub({ POST });

  await ll.loginBasic("alice", "pw", { idP: "htpasswd-b" });

  expect(POST).toHaveBeenCalledWith(
    "/v1/auth/login",
    expect.objectContaining({
      body: expect.objectContaining({
        basic: { login: "alice", password: "pw", idp: "htpasswd-b" },
      }),
    }),
  );
});

test("loginBasic without idP produces the same REST request body as today", async () => {
  const POST = vi.fn(() => Promise.resolve({ data: { token: "jwt" } }));
  const ll = makeLLStub({ POST });

  await ll.loginBasic("alice", "pw");

  expect(POST).toHaveBeenCalledWith(
    "/v1/auth/login",
    expect.objectContaining({
      body: expect.objectContaining({ basic: { login: "alice", password: "pw" } }),
    }),
  );
});
