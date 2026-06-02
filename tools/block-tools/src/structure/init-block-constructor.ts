// `block-tools structure init` constructor: collects BlockVars from CLI
// flags (prompting for any missing field unless --non-interactive),
// assembles `ctx.modules` via the shared `modulesForInit`, and runs the
// engine in init mode against a NodeFileSystem rooted at the target dir.
//
// Replaces the manual `git clone platforma-block-boilerplate` workflow
// and `pl-dev create-block` (templates-strategy.md § "What `init`
// Absorbs"). `--platform` is single-valued: a freshly-init'd block has
// at most one software module.

import { confirm, input, select } from "@inquirer/prompts";
import { NodeFileSystem } from "./engine/fs/node";
import { NodeTemplateProvider } from "./engine/templates";
import { run as engineRun } from "./engine/runner";
import { createRunContext, modulesForInit } from "./engine/ctx";
import { STRUCTURE } from "./structure-definition";
import { STRUCTURE_VERSION } from "./engine/version";
import type { BlockVars } from "./engine/api";

/** Platform choices `init` can scaffold a software module for. Python is
 *  the only platform with a real, buildable scaffold at v1 (Q2); any other
 *  value is rejected rather than scaffolded as a non-buildable placeholder,
 *  which would defeat the "init must produce a working block" intent.
 *  `softwarePlatform` stays in BlockVars for when another platform gets a
 *  real scaffold. (Note: Tengo is the workflow language, not a software
 *  platform.) */
export const SUPPORTED_PLATFORMS = ["python"] as const;

export type InitFlagValues = {
  npmOrg?: string;
  orgScope?: string;
  shortName?: string;
  /** Tri-state: true (--with-software), false (--no-software),
   *  undefined (unspecified → prompt or, non-interactive, default off). */
  withSoftware?: boolean;
  platform?: string;
  nonInteractive: boolean;
};

export type InitInput = {
  /** Resolved BlockVars (from `resolveBlockVars`). */
  vars: BlockVars;
  /** Resolved absolute target directory. */
  blockPath: string;
  /** `<block-tools>/src/structure/templates`. */
  templatesRoot: string;
  log: (msg: string) => void;
};

class InitFlagError extends Error {
  constructor(flag: string) {
    super(
      `Missing required flag --${flag} in --non-interactive mode. ` +
        `Supply every BlockVars flag, or drop --non-interactive to be prompted.`,
    );
    this.name = "InitFlagError";
  }
}

async function need(
  value: string | undefined,
  flag: string,
  nonInteractive: boolean,
  prompt: () => Promise<string>,
): Promise<string> {
  if (value !== undefined && value !== "") return value;
  if (nonInteractive) throw new InitFlagError(flag);
  return prompt();
}

/** Resolve the full BlockVars (incl. softwarePlatform) from flags +
 *  prompts. */
export async function resolveBlockVars(flags: InitFlagValues): Promise<BlockVars> {
  const npmOrg = await need(flags.npmOrg, "npm-org", flags.nonInteractive, () =>
    input({ message: "npm org (e.g. @platforma-open):", default: "@platforma-open" }),
  );
  const orgScope = await need(flags.orgScope, "org-scope", flags.nonInteractive, () =>
    input({ message: "org scope (e.g. my-org):" }),
  );
  const shortName = await need(flags.shortName, "short-name", flags.nonInteractive, () =>
    input({ message: "block short name (e.g. mixcr-clonotyping):" }),
  );

  // Software: explicit flag wins; otherwise prompt (interactive) or
  // default off (non-interactive).
  let hasSoftware: boolean;
  if (flags.withSoftware !== undefined) {
    hasSoftware = flags.withSoftware;
  } else if (flags.nonInteractive) {
    hasSoftware = false;
  } else {
    hasSoftware = await confirm({ message: "Include a software module?", default: false });
  }

  let softwarePlatform: string | undefined;
  if (hasSoftware) {
    softwarePlatform = await need(flags.platform, "platform", flags.nonInteractive, () =>
      select({
        message: "Software platform:",
        choices: SUPPORTED_PLATFORMS.map((p) => ({ name: p, value: p })),
      }),
    );
    if (!(SUPPORTED_PLATFORMS as readonly string[]).includes(softwarePlatform)) {
      throw new Error(
        `Unsupported --platform '${softwarePlatform}'. ` +
          `Only ${SUPPORTED_PLATFORMS.join(", ")} ${
            SUPPORTED_PLATFORMS.length === 1 ? "is" : "are"
          } supported at v1.`,
      );
    }
  } else if (flags.platform) {
    throw new Error("--platform was given but software is disabled (--no-software).");
  }

  const facadeName = `${npmOrg}/${orgScope}.${shortName}`;
  return {
    facadeName,
    baseName: `${orgScope}.${shortName}`,
    npmOrg,
    orgScope,
    shortName,
    softwarePlatform,
  };
}

export async function runInit(init: InitInput): Promise<BlockVars> {
  const vars = init.vars;
  const modules = modulesForInit(vars);

  const fs = new NodeFileSystem(init.blockPath);
  const templates = new NodeTemplateProvider(init.templatesRoot);
  const ctx = createRunContext({
    blockVars: vars,
    modules,
    isSdkInternal: false,
    version: STRUCTURE_VERSION,
    dryRun: false,
  });

  await engineRun(STRUCTURE, fs, ctx, { templates, initMode: true });
  init.log(
    `Initialised block '${vars.facadeName}'${
      vars.softwarePlatform ? ` (software: ${vars.softwarePlatform})` : " (no software)"
    } at ${init.blockPath}`,
  );
  return vars;
}
