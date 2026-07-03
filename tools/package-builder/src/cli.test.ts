import { describe, it, expect } from "vitest";
import { Command } from "commander";
import { buildProgram } from "./cli";
import * as cmdOpts from "./cmd-opts";

function subcommand(cmd: Command, name: string): Command {
  const c = cmd.commands.find((x) => x.name() === name);
  if (!c) throw new Error(`subcommand "${name}" not found`);
  return c;
}

function longNames(cmd: Command): string[] {
  return cmd.options.map((o) => o.long ?? o.short ?? o.name());
}

describe("pl-pkg CLI structure", () => {
  const program = buildProgram();

  it("exposes the expected command tree (space-separated topics)", () => {
    expect(program.commands.map((c) => c.name()).sort()).toEqual([
      "build",
      "prepublish",
      "publish",
    ]);
    expect(
      subcommand(program, "build")
        .commands.map((c) => c.name())
        .sort(),
    ).toEqual(["all", "docker", "packages"]);
    expect(
      subcommand(program, "publish")
        .commands.map((c) => c.name())
        .sort(),
    ).toEqual(["all", "docker", "packages"]);
  });

  it("build carries its full flag surface", () => {
    const names = longNames(subcommand(program, "build"));
    for (const f of [
      "--log-level",
      "--package-root",
      "--force",
      "--dev",
      "--platform",
      "--all-platforms",
      "--version",
      "--docker-build",
      "--docker-no-build",
      "--docker-push-to",
      "--conda-build",
      "--entrypoint",
      "--package-id",
      "--full-dir-hash",
      "--archive",
      "--content-root",
    ]) {
      expect(names).toContain(f);
    }
  });

  it("binds env vars on the value options (flag still wins at parse time)", () => {
    const build = subcommand(program, "build");
    const byLong = (l: string) => build.options.find((o) => o.long === l);
    expect(byLong("--dev")?.envVar).toBe("PL_PKG_DEV");
    expect(byLong("--platform")?.envVar).toBe("PL_PKG_OS");
    expect(byLong("--docker-build")?.envVar).toBe("PL_DOCKER_BUILD");
  });
});

describe("repeatable --package-id collector", () => {
  function parsePackageIds(args: string[]): string[] | undefined {
    let captured: string[] | undefined;
    const cmd = new Command();
    cmd.exitOverride();
    for (const o of cmdOpts.PackageIDOption()) cmd.addOption(o);
    cmd.action((opts: cmdOpts.AnyOptions) => {
      captured = opts.packageId as string[] | undefined;
    });
    cmd.parse(["node", "pl-pkg", ...args]);
    return captured;
  }

  it("is undefined when absent (so skipIfEmpty stays true)", () => {
    expect(parsePackageIds([])).toBeUndefined();
  });

  it("collects repeated flags into an array", () => {
    expect(parsePackageIds(["--package-id", "a", "--package-id", "b"])).toEqual(["a", "b"]);
  });
});
