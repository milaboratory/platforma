import { Command } from "commander";
import { buildKindDist } from "../v2/build_kind_dist";

// @todo: disscuss why we need manifest for kind

/**
 * Thin commander wrapper (build-model.ts shape) delegating to the commander-free
 * `buildKindDist` core. Bundles the compiled kind's identity + src source-hash
 * into `dist/manifest.json`.
 */
export function buildKindManifestCommand(): Command {
  const cmd = new Command("build-kind-manifest").description(
    "Writes the block-kind dist manifest (identity + src source-hash) from a pre-built kind bundle",
  );

  cmd.option(
    "-i, --modulePath <path>",
    "kind package dir (contains package.json, src/, dist/)",
    ".",
  );
  cmd.option(
    "-s, --srcDir <path>",
    "source dir hashed into sourceHash, relative to modulePath",
    "src",
  );
  cmd.option(
    "-o, --dst <path>",
    "output dir with the compiled bundle, relative to modulePath",
    "dist",
  );

  cmd.action(async (flags) => {
    await buildKindDist({
      modulePath: flags.modulePath,
      srcDir: flags.srcDir,
      dst: flags.dst,
    });
  });

  return cmd;
}
