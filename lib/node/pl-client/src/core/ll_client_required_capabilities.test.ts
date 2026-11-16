import { afterEach, expect, test, vi } from "vitest";
import { LLPlClient } from "./ll_client";
import { ClientUpdateRequiredError } from "./errors";
import { missingClientCapabilities } from "./capabilities";
import {
  MaintenanceAPI_Ping_Response_Compression,
  type MaintenanceAPI_Ping_Response,
} from "../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api";

function pingResponse(requiredCapabilities: string[]): MaintenanceAPI_Ping_Response {
  return {
    coreVersion: "9.9.9",
    coreFullVersion: "9.9.9",
    compression: MaintenanceAPI_Ping_Response_Compression.NONE,
    instanceId: "test",
    platform: "linux-x64",
    os: "linux",
    arch: "x64",
    capabilities: [],
    requiredCapabilities,
  };
}

function stubPing(requiredCapabilities: string[]) {
  const ping = vi.spyOn(LLPlClient.prototype, "ping").mockImplementation(async function (
    this: LLPlClient,
  ) {
    const resp = pingResponse(requiredCapabilities);
    (this as unknown as { _serverInfo: MaintenanceAPI_Ping_Response })._serverInfo = resp;
    return resp;
  });
  const authMethods = vi
    .spyOn(LLPlClient.prototype, "authMethods")
    .mockResolvedValue({ methods: [] } as never);
  return { ping, authMethods };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("missingClientCapabilities returns every unknown token in order", () => {
  expect(missingClientCapabilities(undefined)).toEqual([]);
  expect(missingClientCapabilities([])).toEqual([]);
  expect(missingClientCapabilities(["future:v1", "other:v2"])).toEqual(["future:v1", "other:v2"]);
});

test("build refuses a backend that requires an unknown client capability", async () => {
  const { authMethods } = stubPing(["future:v1"]);
  const close = vi.spyOn(LLPlClient.prototype, "close");

  const build = LLPlClient.build("http://127.0.0.1:1");

  await expect(build).rejects.toBeInstanceOf(ClientUpdateRequiredError);
  await expect(build).rejects.toMatchObject({
    name: "ClientUpdateRequiredError",
    missingCapabilities: ["future:v1"],
    serverVersion: "9.9.9",
  });
  expect(authMethods).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

test("build refuses the backend on the wire protocol autodetect path too", async () => {
  const { ping, authMethods } = stubPing(["future:v1"]);

  const build = LLPlClient.build("http://127.0.0.1:1", { useAutoDetectWireProtocol: true });

  await expect(build).rejects.toBeInstanceOf(ClientUpdateRequiredError);
  expect(ping).toHaveBeenCalledOnce();
  expect(authMethods).not.toHaveBeenCalled();
});

test("REST ping reads an absent required_capabilities field as an empty list", async () => {
  stubPing([]);
  const client = await LLPlClient.build("http://127.0.0.1:1");
  vi.mocked(LLPlClient.prototype.ping).mockRestore();
  // An old backend: the REST ping answer has no capability fields at all.
  const restClient = {
    GET: vi.fn().mockResolvedValue({ data: { coreVersion: "1.0.0", coreFullVersion: "1.0.0" } }),
  };
  Object.defineProperty(client, "clientProvider", { value: { get: () => restClient } });

  const resp = await client.ping();

  expect(restClient.GET).toHaveBeenCalledWith("/v1/ping");
  expect(resp.requiredCapabilities).toEqual([]);
  expect(resp.capabilities).toEqual([]);
  await client.close();
});

test("build accepts a backend that requires no client capabilities", async () => {
  const { authMethods } = stubPing([]);

  const client = await LLPlClient.build("http://127.0.0.1:1");

  expect(authMethods).toHaveBeenCalled();
  await client.close();
});
