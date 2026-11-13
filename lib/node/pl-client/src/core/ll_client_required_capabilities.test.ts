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

  const build = LLPlClient.build("http://127.0.0.1:1");

  await expect(build).rejects.toBeInstanceOf(ClientUpdateRequiredError);
  await expect(build).rejects.toMatchObject({
    name: "ClientUpdateRequiredError",
    missingCapabilities: ["future:v1"],
    serverVersion: "9.9.9",
  });
  expect(authMethods).not.toHaveBeenCalled();
});

test("build accepts a backend that requires no client capabilities", async () => {
  const { authMethods } = stubPing([]);

  const client = await LLPlClient.build("http://127.0.0.1:1");

  expect(authMethods).toHaveBeenCalled();
  await client.close();
});
