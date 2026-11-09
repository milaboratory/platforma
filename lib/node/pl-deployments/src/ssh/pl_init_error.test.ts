import { test, expect } from "vitest";
import type { SshPlConfigGenerationResult } from "@milaboratories/pl-config";
import { newConnectionInfo } from "./connection_info";
import type { SshPlPorts } from "./connection_info";
import { platformaInitErrorMessage } from "./pl";

const plPassword = "0123456789abcdef0123456789abcdef";
const minioPassword = "fedcba9876543210fedcba9876543210";

const ports: SshPlPorts = {
  grpc: { local: 1, remote: 2 },
  monitoring: { local: 3, remote: 4 },
  debug: { local: 5, remote: 6 },
  minioPort: { local: 7, remote: 8 },
  minioConsolePort: { local: 9, remote: 10 },
};

const generatedConfig: SshPlConfigGenerationResult = {
  workingDir: "/home/user/.platforma_ssh",
  filesToCreate: { "/home/user/.platforma_ssh/config.yaml": `jwt: ${plPassword}` },
  dirsToCreate: [],
  plConfig: { configPath: "/home/user/.platforma_ssh/config.yaml" },
  minioConfig: {
    envs: { MINIO_ROOT_USER: "minio-user", MINIO_ROOT_PASSWORD: minioPassword },
    storageDir: "/home/user/.platforma_ssh/storages/main",
  },
  plAddress: "http://127.0.0.1:1",
  plUser: "default-user",
  plPassword,
};

test("platformaInit error message does not contain generated credentials", () => {
  const connectionInfo = newConnectionInfo("default-user", plPassword, ports, false, "3.5.0", true);
  const msg = platformaInitErrorMessage(new Error("panic: failed to start"), {
    step: "startPlatforma",
    existedSettings: connectionInfo,
    generatedConfig,
    connectionInfo,
  });

  expect(msg).toContain("panic: failed to start");
  expect(msg).toContain('"step":"startPlatforma"');
  expect(msg).toContain('"plUser":"default-user"');
  expect(msg).not.toContain(plPassword);
  expect(msg).not.toContain(minioPassword);
});

test("platformaInit error message does not change the state it reports", () => {
  const connectionInfo = newConnectionInfo("default-user", plPassword, ports, false, "3.5.0", true);
  const state = { step: "startPlatforma" as const, generatedConfig, connectionInfo };
  platformaInitErrorMessage(new Error("x"), state);
  expect(state.connectionInfo.plPassword).toBe(plPassword);
  expect(state.generatedConfig.plPassword).toBe(plPassword);
  expect(state.generatedConfig.minioConfig.envs.MINIO_ROOT_PASSWORD).toBe(minioPassword);
});
