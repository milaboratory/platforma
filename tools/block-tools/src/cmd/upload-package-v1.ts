import { Command, Option } from "commander";
import { getConfig } from "../registry_v1/config";
import { targetFileOption } from "../registry_v1/flags";
import fs from "node:fs";
import YAML from "yaml";
import { PlRegPackageConfigDataShard } from "../registry_v1/config_schema";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";

type BasicConfigField = keyof PlRegPackageConfigDataShard &
  ("registry" | "organization" | "package" | "version");
const BasicConfigFields: BasicConfigField[] = ["registry", "organization", "package", "version"];

export function uploadPackageV1Command(): Command {
  const cmd = new Command("upload-package-v1").description(
    "Uploads V1 package and refreshes the registry",
  );

  cmd.addOption(
    new Option(
      "-r, --registry <address|alias>",
      "full address of the registry or alias from .pl.reg",
    ).env("PL_REGISTRY"),
  );
  cmd.addOption(
    new Option("-o, --organization <organization>", "target organisation").env(
      "PL_PACKAGE_ORGANIZATION",
    ),
  );
  cmd.addOption(new Option("-p, --package <package>", "target package").env("PL_PACKAGE_NAME"));
  cmd.addOption(new Option("-v, --version <version>", "target version").env("PL_PACKAGE_VERSION"));
  cmd.option(
    "-m, --meta <path>",
    "json file containing meta information to associate with tha package",
  );
  cmd.addOption(targetFileOption("-f, --file <file>", "package files"));
  cmd.addOption(
    new Option("--refresh", "refresh repository after adding the package")
      .default(true)
      .env("PL_REGISTRY_REFRESH"),
  );
  cmd.option("--no-refresh", "do not refresh repository after adding the package");

  cmd.action(async (flags) => {
    const logger = new ConsoleLoggerAdapter();
    const configFromFlags: PlRegPackageConfigDataShard = PlRegPackageConfigDataShard.parse({});

    for (const field of BasicConfigFields) if (flags[field]) configFromFlags[field] = flags[field];

    if (flags.meta) {
      if (flags.meta.endsWith(".json"))
        configFromFlags.meta = JSON.parse(
          await fs.promises.readFile(flags.meta, { encoding: "utf-8" }),
        ) as Record<string, unknown>;
      else if (flags.meta.endsWith(".yaml"))
        configFromFlags.meta = YAML.parse(
          await fs.promises.readFile(flags.meta, { encoding: "utf-8" }),
        ) as Record<string, unknown>;
    }

    for (const targetFile of flags.file) {
      configFromFlags.files[targetFile.destName] = targetFile.src;
    }

    const conf = await getConfig(configFromFlags);

    logger.info(YAML.stringify(conf.conf));

    const registry = conf.createRegistry(logger);
    const name = conf.fullPackageName;

    const builder = registry.constructNewPackage(name);

    for (const [dst, src] of Object.entries(conf.conf.files)) {
      logger.info(`Uploading ${src} -> ${dst} ...`);
      const content = await fs.promises.readFile(src);
      await builder.addFile(dst, content);
    }

    logger.info(`Uploading meta information...`);
    await builder.writeMeta(conf.conf.meta);
    await builder.finish();

    if (flags.refresh) await registry.updateIfNeeded();
  });

  return cmd;
}
