import { describe, it, expect, afterEach } from "vitest";
import {
  authSource,
  createdEpoch,
  helperAnswerToAuth,
  isEnabled,
  normalizeRegistryKey,
  parseDockerConfig,
  parseLayers,
  parseTaggerSummary,
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

  it("takes credentials in docker's order: credHelpers, then credsStore, then auths", () => {
    const withStore = parseDockerConfig(
      JSON.stringify({
        auths: { "quay.io": { auth: b64("stale:entry") } },
        credsStore: "osxkeychain",
        credHelpers: { "public.ecr.aws": "ecr-login" },
      }),
    );
    expect(authSource(withStore, "public.ecr.aws")).toEqual({
      kind: "helper",
      helper: "ecr-login",
    });
    // with a credsStore, docker ignores inline auths
    expect(authSource(withStore, "quay.io")).toEqual({ kind: "helper", helper: "osxkeychain" });

    const inline = parseDockerConfig(
      JSON.stringify({ auths: { "quay.io": { auth: b64("robot:s3cr:et") }, "ghcr.io": {} } }),
    );
    expect(authSource(inline, "quay.io")).toEqual({
      kind: "entry",
      entry: { auth: b64("robot:s3cr:et"), identitytoken: undefined, registrytoken: undefined },
    });
    expect(authSource(inline, "ghcr.io")).toEqual({ kind: "none" });
  });

  it("normalizes config keys and keeps identity tokens", () => {
    const config = parseDockerConfig(
      JSON.stringify({
        auths: {
          "https://index.docker.io/v1/": { auth: b64("u:p") },
          "https://myacr.azurecr.io": { identitytoken: "tok" },
        },
      }),
    );
    expect(authSource(config, "docker.io")).toEqual({
      kind: "entry",
      entry: { auth: b64("u:p"), identitytoken: undefined, registrytoken: undefined },
    });
    expect(authSource(config, "myacr.azurecr.io")).toEqual({
      kind: "entry",
      entry: { auth: undefined, identitytoken: "tok", registrytoken: undefined },
    });
    expect(normalizeRegistryKey("Quay.io/v2/")).toBe("quay.io");
    expect(authSource(parseDockerConfig("{}"), "quay.io")).toEqual({ kind: "none" });
  });

  it("accepts user/password fields and prefers host keys over repository-scoped ones", () => {
    const config = parseDockerConfig(
      JSON.stringify({
        auths: {
          "quay.io": { username: "robot", password: "pw" },
          "quay.io/org": { auth: b64("other:x") },
          "ghcr.io": { registrytoken: "rt" },
        },
      }),
    );
    expect(authSource(config, "quay.io")).toEqual({
      kind: "entry",
      entry: { auth: b64("robot:pw"), identitytoken: undefined, registrytoken: undefined },
    });
    expect(authSource(config, "ghcr.io")).toEqual({
      kind: "entry",
      entry: { auth: undefined, identitytoken: undefined, registrytoken: "rt" },
    });
    expect(registryHost("index.docker.io/library/python:3")).toBe("docker.io");
  });

  it("reads the tagger's summary line", () => {
    expect(parseTaggerSummary('relayer: summary\n{"special": ["/app/pipe"]}\n')).toEqual({
      special: ["/app/pipe"],
    });
    expect(() => parseTaggerSummary("relayer: 3 files")).toThrow();
  });

  it("turns a credential helper's answer into a config entry", () => {
    expect(helperAnswerToAuth(JSON.stringify({ Username: "AWS", Secret: "pw" }))).toEqual({
      auth: b64("AWS:pw"),
    });
    expect(helperAnswerToAuth(JSON.stringify({ Username: "<token>", Secret: "tok" }))).toEqual({
      identitytoken: "tok",
    });
    expect(helperAnswerToAuth(JSON.stringify({ Username: "u", Secret: "" }))).toBeUndefined();
  });

  it("reads the image creation time for chunkah's mtime clamp", () => {
    expect(createdEpoch("2026-11-10T12:00:00.123456789Z")).toBe(1794312000);
    expect(createdEpoch("")).toBe(0);
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
