import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { loadPackDescriptionRaw } from "../v2";
import { embedBlockPackMetaAbsoluteBase64, resolveBlockPackMeta } from "../v2/model/block_meta";

export function buildMetaCommand(): Command {
  const cmd = new Command("build-meta").description(
    "Extracts meta information from blocks package.json and outputs meta.json with embedded binary " +
      "and textual information linked from the meta section.",
  );

  cmd.option("-i, --modulePath <path>", "input module path", ".");
  cmd.requiredOption("-o, --destination <path>", "output meta.json file");

  cmd.action(async (flags) => {
    const modulePath = path.resolve(flags.modulePath);
    const descriptionRaw = await loadPackDescriptionRaw(modulePath);
    const metaEmbedded = await embedBlockPackMetaAbsoluteBase64(
      await resolveBlockPackMeta(descriptionRaw.meta, modulePath),
    );

    await fs.promises.writeFile(path.resolve(flags.destination), JSON.stringify(metaEmbedded));
  });

  return cmd;
}
