import { describe, it, expect } from "vitest";
import { parseScenario, planFor, type Knobs } from "./knobs";

const plan = (knobs: Knobs) => planFor(parseScenario(knobs));

describe("parseScenario — knobs collapse to the supported set", () => {
  it("no location => legacy (bare invocation, pl-pkg parity)", () => {
    expect(parseScenario({})).toEqual({ kind: "legacy" });
    expect(parseScenario({ channel: "dev" })).toEqual({ kind: "legacy" });
  });

  it("explicit location => a target cell with variant normalized to both kinds", () => {
    expect(parseScenario({ channel: "dev", variant: "binary", location: "remote" })).toEqual({
      kind: "target",
      channel: "dev",
      docker: false,
      binary: true,
      remote: true,
    });
    expect(parseScenario({ location: "local" })).toEqual({
      kind: "target",
      channel: "release",
      docker: true,
      binary: true,
      remote: false,
    });
  });

  it("use-published collapses everything but rejects docker", () => {
    expect(parseScenario({ channel: "dev", usePublished: true })).toEqual({
      kind: "use-published",
    });
    expect(() => parseScenario({ usePublished: true, variant: "docker" })).toThrow(/binary-only/);
  });

  it("ssh is rejected", () => {
    expect(() => parseScenario({ location: "ssh" })).toThrow(/ssh/);
  });
});

describe("planFor — scenario to build plan", () => {
  it("legacy == pl-pkg build (release, build both, no binary upload, CI-gated docker push)", () => {
    expect(plan({})).toMatchObject({
      buildMode: "release",
      buildDocker: true,
      buildBinary: true,
      uploadBinary: false,
      usePublished: false,
      isCIDefaultPush: true,
    });
  });

  it("dev-binary-local => dev-local, no push", () => {
    expect(plan({ channel: "dev", variant: "binary", location: "local" })).toMatchObject({
      buildMode: "dev-local",
      uploadBinary: false,
      pushDocker: false,
    });
  });

  it("dev-binary-remote => dev-remote, build + upload (the net-new cell)", () => {
    expect(plan({ channel: "dev", variant: "binary", location: "remote" })).toMatchObject({
      buildMode: "dev-remote",
      buildBinary: true,
      uploadBinary: true,
    });
  });

  it("dev-docker local/remote stay dev-local (docker is orthogonal to the dev binary mode)", () => {
    expect(plan({ channel: "dev", variant: "docker", location: "local" })).toMatchObject({
      buildMode: "dev-local",
      buildDocker: true,
      pushDocker: false,
    });
    expect(plan({ channel: "dev", variant: "docker", location: "remote" })).toMatchObject({
      buildMode: "dev-local",
      buildDocker: true,
      pushDocker: true,
    });
  });

  it("release + remote folds in the binary upload", () => {
    expect(plan({ channel: "release", variant: "binary", location: "remote" })).toMatchObject({
      buildMode: "release",
      uploadBinary: true,
    });
  });

  it("use-published => descriptor only, no build/push", () => {
    expect(plan({ channel: "dev", usePublished: true })).toMatchObject({
      buildMode: "release",
      buildDocker: false,
      buildBinary: false,
      pushDocker: false,
      uploadBinary: false,
      usePublished: true,
    });
  });
});
