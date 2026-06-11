import { Args, Command, Flags } from "@oclif/core";
import path from "node:path";
import {
  resolveBlockVars,
  runInit,
  SUPPORTED_PLATFORMS,
  type InitFlagValues,
} from "../../structure/init-block-constructor";

export default class StructureInit extends Command {
  static override description =
    "Scaffold a fresh Platforma block from the canonical structure. Missing flags are prompted unless --non-interactive.";

  static override examples = [
    "<%= config.bin %> <%= command.id %> --npm-org @platforma-open --org-scope my-org --short-name demo --no-software --non-interactive",
    "<%= config.bin %> <%= command.id %> ./demo --npm-org @platforma-open --org-scope my-org --short-name demo --with-software --platform python --non-interactive",
  ];

  static override args = {
    path: Args.string({
      description: "target directory (default: <short-name> under the current directory)",
    }),
  };

  static override flags = {
    "npm-org": Flags.string({ description: "npm org, e.g. @platforma-open" }),
    "org-scope": Flags.string({ description: "org scope, e.g. my-org" }),
    "short-name": Flags.string({ description: "block short name, e.g. mixcr-clonotyping" }),
    "with-software": Flags.boolean({ description: "include a software module" }),
    "no-software": Flags.boolean({ description: "omit the software module" }),
    platform: Flags.string({
      description: "software platform (single-valued)",
      options: [...SUPPORTED_PLATFORMS],
    }),
    "non-interactive": Flags.boolean({
      description: "error on any missing flag instead of prompting",
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(StructureInit);

    if (flags["with-software"] && flags["no-software"]) {
      this.error("--with-software and --no-software are mutually exclusive.");
    }
    const withSoftware = flags["with-software"] ? true : flags["no-software"] ? false : undefined;

    const flagValues: InitFlagValues = {
      npmOrg: flags["npm-org"],
      orgScope: flags["org-scope"],
      shortName: flags["short-name"],
      withSoftware,
      platform: flags.platform,
      nonInteractive: flags["non-interactive"],
    };

    const vars = await resolveBlockVars(flagValues);
    const blockPath = args.path
      ? path.resolve(args.path)
      : path.resolve(process.cwd(), vars.shortName);
    const templatesRoot = path.join(this.config.root, "src", "structure", "templates");

    await runInit({ vars, blockPath, templatesRoot, log: (m) => this.log(m) });
  }
}
