import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";

async function getFileContent(path: string) {
  try {
    return await fs.promises.readFile(path, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export function buildModelCommand(): Command {
  const cmd = new Command("build-model").description(
    "Extracts and outputs block model JSON from pre-built block model module",
  );

  cmd.option("-i, --modulePath <path>", "input module path", ".");
  cmd.option(
    "-b, --sourceBundle <path>",
    "bundled model code to embed into the model for callback-based rendering to work",
    "./dist/bundle.js",
  );
  cmd.option("-o, --destination <path>", "output model file", "./dist/model.json");

  cmd.action(async (flags) => {
    const modulePath = path.resolve(flags.modulePath); // i.e. folder with package.json file
    let { model, platforma } = require(modulePath);

    if (!model) model = platforma;
    if (!model) throw new Error('"model" export not found');

    const { config } = model;

    if (!config)
      throw new Error(
        'Malformed "model" object, check it is created with "BlockModel" ' +
          'and ".done()" is executed as the call in the chain.',
      );

    if (!("outputs" in config) || !("sections" in config))
      throw new Error('"config" has unexpected structure');

    const code = await getFileContent(flags.sourceBundle);
    if (code !== undefined) {
      config.code = {
        type: "plain",
        content: code,
      };
    }

    await fs.promises.writeFile(path.resolve(flags.destination), JSON.stringify(config));
  });

  return cmd;
}
