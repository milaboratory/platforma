import { Command, Option } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { createLogger, getTengoFiles, pathType } from "../compiler/util";
import { dropImportLines, findUnusedImports } from "../compiler/imports";
import { resolvePackageJsonRoot } from "../compiler/main";
import * as opts from "../shared/basecmd";

// The same limit the tags generation uses: deep enough for any real source
// tree, shallow enough to keep a scan started in a wrong place cheap.
const maxScanDepth = 9;

export default function importsCommand(): Command {
  const cmd = new Command("imports").description("find imports tengo sources do not use");

  cmd.argument("[paths...]", "source paths to scan (defaults to ./src)");
  opts.addOptions(cmd, opts.GlobalOptions());
  cmd.addOption(new Option("--check", "report unused imports and fail, change no file"));
  cmd.addOption(new Option("--fix", "remove unused imports from the sources"));

  cmd.action(async (paths: string[], o) => {
    const logger = createLogger(o.logLevel as string);

    if (o.check && o.fix) {
      cmd.error("error: options '--check' and '--fix' cannot be used together");
    }

    // Without an explicit mode: fix the sources when a human runs the command,
    // report and fail when CI does. CI must never commit a change of its own.
    const fix = o.fix ? true : o.check ? false : !process.env.CI;

    const roots = paths.length == 0 ? ["./src"] : paths;
    const localPackageName = getLocalPackageName();

    let hasUnusedImports = false;
    let hasBrokenSources = false;

    for (const file of collectSources(roots)) {
      const src = fs.readFileSync(file).toString();

      let unused;
      try {
        unused = findUnusedImports(logger, src, localPackageName, file);
      } catch (err: unknown) {
        // A source we cannot parse is a problem for 'pl-tengo check' to
        // report in full. Here we keep the file as it is and move on, so a
        // single broken source does not block the cleanup of all the others.
        logger.error(err);
        hasBrokenSources = true;
        continue;
      }

      if (unused.length == 0) {
        continue;
      }

      hasUnusedImports = true;
      logger.warn(`${file}: unused imports: ${unused.map((im) => im.alias).join(", ")}`);

      if (fix) {
        logger.info(`fixing ${file}...`);
        fs.writeFileSync(
          file,
          dropImportLines(
            src,
            unused.map((im) => im.lineNo),
          ),
        );
      }
    }

    if (hasBrokenSources || (hasUnusedImports && !fix)) {
      process.exit(1);
    }
  });

  return cmd;
}

/** Package name of the sources we scan. Used to resolve local ':<item>'
 *  imports. An empty name keeps the parser working for a directory that is
 *  not a package. */
function getLocalPackageName(): string {
  try {
    const packageJson = fs.readFileSync(resolvePackageJsonRoot(process.cwd())).toString();
    return (JSON.parse(packageJson) as { name?: string }).name ?? "";
  } catch {
    return "";
  }
}

function collectSources(roots: string[]): string[] {
  const sources: string[] = [];

  for (const root of roots) {
    const type = pathType(root);
    if (type === "dir") {
      sources.push(...getTengoFiles(path.resolve(root), maxScanDepth));
      continue;
    }
    if (type === "file") {
      sources.push(path.resolve(root));
      continue;
    }

    throw new Error(`source path not found: ${root}`);
  }

  return sources;
}
