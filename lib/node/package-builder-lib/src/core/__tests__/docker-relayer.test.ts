import { describe, it, expect, afterEach } from "vitest";
import {
  authSource,
  isEnabled,
  parseDockerConfig,
  parseLayers,
  registryHost,
} from "../docker-relayer";
import * as envs from "../envs";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("docker-relayer", () => {
  afterEach(() => {
    delete process.env[envs.PL_DOCKER_RELAYER];
  });

  it("is off unless PL_DOCKER_RELAYER=chunkah, and rejects unknown values", () => {
    expect(isEnabled()).toBe(false);
    process.env[envs.PL_DOCKER_RELAYER] = "off";
    expect(isEnabled()).toBe(false);
    process.env[envs.PL_DOCKER_RELAYER] = "chunkah";
    expect(isEnabled()).toBe(true);
    process.env[envs.PL_DOCKER_RELAYER] = "crane";
    expect(() => isEnabled()).toThrow(/must be 'chunkah' or 'off'/);
  });

  it("finds the registry host of an image reference", () => {
    expect(registryHost("quay.io/org/repo:tag")).toBe("quay.io");
    expect(registryHost("localhost:5000/repo:tag")).toBe("localhost:5000");
    expect(registryHost("public.ecr.aws/x/y:1")).toBe("public.ecr.aws");
    expect(registryHost("library/python:3.12")).toBe("docker.io");
    expect(registryHost("python:3.12")).toBe("docker.io");
  });

  it("takes credentials in docker's order: credHelpers, auths, credsStore", () => {
    const config = parseDockerConfig(
      JSON.stringify({
        auths: { "quay.io": { auth: b64("robot:s3cr:et") }, "ghcr.io": {} },
        credsStore: "osxkeychain",
        credHelpers: { "public.ecr.aws": "ecr-login" },
      }),
    );

    expect(authSource(config, "public.ecr.aws")).toEqual({ kind: "helper", helper: "ecr-login" });
    // a colon in the password stays in the password
    expect(authSource(config, "quay.io")).toEqual({
      kind: "basic",
      username: "robot",
      password: "s3cr:et",
    });
    // an entry without 'auth' is a placeholder: the store holds the secret
    expect(authSource(config, "ghcr.io")).toEqual({ kind: "helper", helper: "osxkeychain" });
  });

  it("maps docker.io to its config key and allows anonymous access", () => {
    const config = parseDockerConfig(
      JSON.stringify({ auths: { "https://index.docker.io/v1/": { auth: b64("u:p") } } }),
    );
    expect(authSource(config, "docker.io")).toEqual({
      kind: "basic",
      username: "u",
      password: "p",
    });
    expect(authSource(parseDockerConfig("{}"), "quay.io")).toBeUndefined();
  });

  it("reads layer sizes and components of the manifest summary", () => {
    expect(
      parseLayers(
        JSON.stringify([
          [100, "xattr/pypi/numpy"],
          [5, ""],
        ]),
      ),
    ).toEqual([
      { bytes: 100, createdBy: "component xattr/pypi/numpy" },
      { bytes: 5, createdBy: "" },
    ]);
    expect(() => parseLayers("{}")).toThrow(/unexpected manifest summary/);
  });
});
