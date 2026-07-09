import { Command, Option } from "commander";
import type { OutputFormat } from "./output";

/** Add one or more groups of options to a command, preserving group order. */
export function addOptions(cmd: Command, ...optionGroups: Option[][]): Command {
  for (const group of optionGroups) {
    for (const opt of group) cmd.addOption(opt);
  }
  return cmd;
}

export const GlobalOptions = (formatDefault: OutputFormat = "text"): Option[] => [
  new Option("-a, --address <url>", "Platforma server address")
    .env("PL_ADDRESS")
    .makeOptionMandatory(),
  new Option("-f, --format <format>", "Output format")
    .choices(["text", "json", "csv"])
    .default(formatDefault),
];

export const UserAuthOptions = (): Option[] => [
  new Option("-u, --user <user>", "Username for authentication").env("PL_USER"),
  new Option("-p, --password <password>", "Password for authentication").env("PL_PASSWORD"),
];

/** Admin credentials only (for purely admin commands like copy-project). */
export const AdminAuthOptions = (): Option[] => [
  new Option("--admin-user <user>", "Admin/controller username")
    .env("PL_ADMIN_USER")
    .makeOptionMandatory(),
  new Option("--admin-password <password>", "Admin/controller password")
    .env("PL_ADMIN_PASSWORD")
    .makeOptionMandatory(),
];

/** Admin credentials + target user (for regular commands that can optionally operate on another user). */
export const AdminTargetOptions = (): Option[] => [
  new Option("--admin-user <user>", "Admin/controller username (enables admin mode)").env(
    "PL_ADMIN_USER",
  ),
  new Option("--admin-password <password>", "Admin/controller password").env("PL_ADMIN_PASSWORD"),
  new Option(
    "--target-user <user>",
    "Operate on this user's data (requires admin credentials)",
  ).env("PL_TARGET_USER"),
];
