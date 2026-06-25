import { Command, Option } from "commander";
import fs from "node:fs";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import { ManifestFileName } from "../v2/registry/schema_public";
import {
  BlockPackManifest,
  overrideManifestVersion,
  StableChannel,
} from "@milaboratories/pl-model-middle-layer";
import { storageByUrl } from "../io/storage";
import { BlockRegistryV2 } from "../v2/registry/registry";
import path from "node:path";

function simpleDeepMerge<T extends Record<string, unknown>>(
  target: Record<string, unknown>,
  source: T,
): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
        result[key] = simpleDeepMerge(
          result[key] as Record<string, unknown>,
          source[key] as Record<string, unknown>,
        );
      } else {
        result[key] = source[key];
      }
    } else {
      result[key] = source[key];
    }
  }

  return result as T;
}

export function publishCommand(): Command {
  const cmd = new Command("publish").description(
    "Publishes the block package and refreshes the registry (for v2 block-pack schema)",
  );

  cmd.addOption(
    new Option("-r, --registry <address>", "full address of the registry")
      .env("PL_REGISTRY")
      .makeOptionMandatory(),
  );
  cmd.option("-m, --manifest <path>", "manifest file path", `./block-pack/${ManifestFileName}`);
  cmd.option("-v, --version-override <path>", "override package version");
  cmd.addOption(
    new Option("--refresh", "refresh repository after adding the package")
      .default(true)
      .env("PL_REGISTRY_REFRESH"),
  );
  cmd.option("--no-refresh", "do not refresh repository after adding the package");
  cmd.addOption(
    new Option("--unstable", "do not add the published package to stable channel")
      .default(false)
      .env("PL_PUBLISH_UNSTABLE"),
  );

  cmd.action(async (flags) => {
    const logger = new ConsoleLoggerAdapter();

    const manifestPath = path.resolve(flags.manifest);
    const rawManifest = JSON.parse(
      await fs.promises.readFile(manifestPath, { encoding: "utf-8" }),
    ) as Record<string, unknown>;
    let manifest = BlockPackManifest.parse(rawManifest);
    // To keep extra fields from the manifest and keep coerced fields
    manifest = simpleDeepMerge(
      rawManifest,
      manifest as BlockPackManifest & Record<string, unknown>,
    );
    const manifestRoot = path.dirname(manifestPath);

    logger.info(`Manifest root = ${manifestRoot}`);

    if (flags.versionOverride) manifest = overrideManifestVersion(manifest, flags.versionOverride);

    const storage = storageByUrl(flags.registry);
    const registry = new BlockRegistryV2(storage, logger);

    await registry.publishPackage(manifest, async (file) =>
      Buffer.from(await fs.promises.readFile(path.resolve(manifestRoot, file))),
    );

    if (!flags.unstable) {
      logger.info(`Adding package to ${StableChannel} channel...`);
      await registry.addPackageToChannel(manifest.description.id, StableChannel);
    }

    if (flags.refresh) await registry.updateIfNeeded();
  });

  return cmd;
}
