import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const base = process.argv[2];
if (!base) {
  console.error("Usage: check-change-intents.mjs <base ref>");
  process.exit(2);
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" });
const projects = (filter = []) =>
  JSON.parse(run("pnpm", ["ls", "-r", "--depth", "-1", "--json", ...filter]));

const errors = [];

const changed = projects(["--filter", `[${base}]`]).filter((project) => !project.private);
const intents = run("git", [
  "diff",
  "--name-only",
  "--no-renames",
  "--diff-filter=AM",
  `${base}...HEAD`,
  "--",
  ".changeset/*.md",
])
  .split("\n")
  .filter((file) => file !== "");
if (changed.length > 0 && intents.length === 0) {
  errors.push(
    `No change intent for changed packages: ${changed.map((project) => project.name).join(", ")}.`,
  );
  errors.push(
    'Run `pnpm change <package>... --bump <type> --summary "<text>"`. Use `--bump none` for no release.',
  );
}

const ledgerFile = ".changeset/ledger.yaml";
const ledger = existsSync(ledgerFile) ? readFileSync(ledgerFile, "utf8") : "";
const released = new Set(ledger.matchAll(/^ {4}- "?(.+?)"?$/gm).map((match) => match[1]));
for (const file of intents) {
  if (released.has(basename(file, ".md"))) {
    errors.push(`${file}: a released intent had this name. Rename the file.`);
  }
}

const all = projects();
const names = new Set(all.map((project) => project.name));
const ignored = new Set(JSON.parse(run("pnpm", ["config", "get", "versioning", "--json"])).ignore);
for (const { name, version, private: isPrivate } of all) {
  if (isPrivate && version && !ignored.has(name)) {
    errors.push(`Add the private package ${name} to versioning.ignore in pnpm-workspace.yaml.`);
  }
}
for (const name of ignored) {
  if (!names.has(name)) {
    errors.push(`Remove ${name} from versioning.ignore in pnpm-workspace.yaml: no such package.`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
