// Regression tests for the "built but never pushed" guard (MILAB-6714).
//
// The trap: `"private": true` on a software package flips the auto-push default
// off, the descriptor is still written with the image tag, CI goes green, and
// the block 404s pulling the image at runtime.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertDockerPushIntent, type PushIntent } from "../push-guard";

const PUSH_SUPPRESSED: PushIntent = {
  buildDocker: true,
  pushDocker: false,
  pushDisabledExplicitly: false,
  dockerPackageCount: 1,
};

describe("assertDockerPushIntent", () => {
  let ci: string | undefined;

  beforeEach(() => {
    ci = process.env.CI;
    process.env.CI = "true";
  });

  afterEach(() => {
    if (ci === undefined) delete process.env.CI;
    else process.env.CI = ci;
  });

  it("throws when CI builds docker images it will not push", () => {
    expect(() => assertDockerPushIntent(PUSH_SUPPRESSED)).toThrow(/without pushing them/);
  });

  it("names private as the likely cause", () => {
    expect(() => assertDockerPushIntent(PUSH_SUPPRESSED)).toThrow(/"private": true/);
  });

  it("accepts an explicit --docker-no-autopush", () => {
    expect(() =>
      assertDockerPushIntent({ ...PUSH_SUPPRESSED, pushDisabledExplicitly: true }),
    ).not.toThrow();
  });

  it("accepts a run that does push", () => {
    expect(() => assertDockerPushIntent({ ...PUSH_SUPPRESSED, pushDocker: true })).not.toThrow();
  });

  it("accepts a run that builds no docker images", () => {
    expect(() => assertDockerPushIntent({ ...PUSH_SUPPRESSED, buildDocker: false })).not.toThrow();
  });

  it("accepts a package with no docker entrypoints", () => {
    expect(() =>
      assertDockerPushIntent({ ...PUSH_SUPPRESSED, dockerPackageCount: 0 }),
    ).not.toThrow();
  });

  it("stays out of the way outside CI, where dev iteration never pushes", () => {
    delete process.env.CI;
    expect(() => assertDockerPushIntent(PUSH_SUPPRESSED)).not.toThrow();
  });
});
