import { describe, it, expect } from "vitest";
import { resolvePlan } from "./knobs";

describe("software build knob → plan mapping", () => {
  it("no knobs == pl-pkg build (release, build both, no binary upload, CI-gated docker push)", () => {
    const p = resolvePlan({});
    expect(p).toMatchObject({
      buildMode: "release",
      buildDocker: true,
      buildBinary: true,
      uploadBinary: false, // location unset => never uploads binaries (pl-pkg parity)
      usePublished: false,
      isCIDefaultPush: true,
    });
  });

  it("dev-binary-local => dev-local, local descriptor, no push", () => {
    const p = resolvePlan({ channel: "dev", variant: "binary", location: "local" });
    expect(p).toMatchObject({ buildMode: "dev-local", uploadBinary: false, pushDocker: false });
  });

  it("dev-binary-remote => dev-remote, build + upload (the net-new cell)", () => {
    const p = resolvePlan({ channel: "dev", variant: "binary", location: "remote" });
    expect(p).toMatchObject({ buildMode: "dev-remote", buildBinary: true, uploadBinary: true });
  });

  it("dev-docker-local/remote stay dev-local (docker is orthogonal to the dev binary mode)", () => {
    expect(resolvePlan({ channel: "dev", variant: "docker", location: "local" })).toMatchObject({
      buildMode: "dev-local",
      buildDocker: true,
      pushDocker: false,
    });
    expect(resolvePlan({ channel: "dev", variant: "docker", location: "remote" })).toMatchObject({
      buildMode: "dev-local",
      buildDocker: true,
      pushDocker: true,
    });
  });

  it("release + remote folds in the binary upload", () => {
    const p = resolvePlan({ channel: "release", variant: "binary", location: "remote" });
    expect(p).toMatchObject({ buildMode: "release", uploadBinary: true });
  });

  it("use-published => descriptor only, no build/push", () => {
    const p = resolvePlan({ channel: "dev", usePublished: true });
    expect(p).toMatchObject({
      buildMode: "release",
      buildDocker: false,
      buildBinary: false,
      pushDocker: false,
      uploadBinary: false,
      usePublished: true,
    });
  });

  it("ssh and use-published+docker are rejected", () => {
    expect(() => resolvePlan({ location: "ssh" })).toThrow(/ssh/);
    expect(() => resolvePlan({ usePublished: true, variant: "docker" })).toThrow(/binary-only/);
  });
});
