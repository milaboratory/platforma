import { describe, it, expect } from "vitest";
import type { Command } from "commander";
import { buildProgram } from "./cli";

function subcommand(cmd: Command, name: string): Command {
  const c = cmd.commands.find((x) => x.name() === name);
  if (!c) throw new Error(`subcommand "${name}" not found`);
  return c;
}

function longNames(cmd: Command): string[] {
  return cmd.options.map((o) => o.long ?? o.short ?? o.name());
}

describe("block-tools CLI structure", () => {
  const program = buildProgram();

  it("exposes the full command surface (11 commands + structure topic)", () => {
    expect(program.commands.map((c) => c.name()).sort()).toEqual([
      "build-meta",
      "build-model",
      "list-overview-snapshots",
      "mark-stable",
      "pack",
      "publish",
      "refresh-registry",
      "restore-overview-from-snapshot",
      "software",
      "structure",
      "update-deps",
      "upload-package-v1",
    ]);
    expect(
      subcommand(program, "structure")
        .commands.map((c) => c.name())
        .sort(),
    ).toEqual(["check", "init", "refresh"]);
    expect(
      subcommand(program, "software")
        .commands.map((c) => c.name())
        .sort(),
    ).toEqual(["build"]);
  });

  it("software build exposes the three knobs + use-published with env bindings", () => {
    const build = subcommand(subcommand(program, "software"), "build");
    const names = longNames(build);
    for (const f of ["--channel", "--variant", "--location", "--use-published"]) {
      expect(names).toContain(f);
    }
    const env = (long: string) => build.options.find((o) => o.long === long)?.envVar;
    expect(env("--channel")).toBe("PL_BUILD_CHANNEL");
    expect(env("--variant")).toBe("PL_BUILD_VARIANT");
    expect(env("--location")).toBe("PL_BUILD_LOCATION");
    expect(env("--use-published")).toBe("PL_BUILD_USE_PUBLISHED");
  });

  it("preserves key flags + env bindings", () => {
    const publish = subcommand(program, "publish");
    const pnames = longNames(publish);
    for (const f of ["--registry", "--manifest", "--version-override", "--refresh", "--unstable"]) {
      expect(pnames).toContain(f);
    }
    // --no-refresh negation and PL_REGISTRY env preserved
    expect(pnames).toContain("--no-refresh");
    expect(publish.options.find((o) => o.long === "--registry")?.envVar).toBe("PL_REGISTRY");

    // structure init keeps its positional [path] and the with/no-software pair
    const init = subcommand(subcommand(program, "structure"), "init");
    const inames = longNames(init);
    expect(inames).toContain("--with-software");
    expect(inames).toContain("--no-software");
    expect(init.registeredArguments.map((a) => a.name())).toContain("path");
  });
});
