import fs from 'fs';
import path from 'path';
import * as process from 'process';

import { Command } from '@oclif/core';

import * as opts from './cmd-opts'
import * as util from './util';

export default class OclifIndex extends Command {
  static flags = {
    ...opts.LogLevelFlag,
    ...opts.CommandsRootFlag,
    ...opts.SourceExtensionFlag,
    ...opts.IndexFileFlag,
  };

  async run() {
    const { flags } = await this.parse(OclifIndex);
    const logger = util.createLogger(flags['log-level']);

    const commandsRoot = flags['commands-root'];
    const sourceExtension = flags['source-extension'];

    const indexName = flags['index-file'] ?? `./src/index${sourceExtension}`;
    const indexDir = path.dirname(indexName)

    const packageRoot = util.findPackageRoot(logger);
    process.chdir(packageRoot) // change current dir to package's root to avoid resolving all paths.

    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const oclifConfig = packageJson.oclif

    if (!oclifConfig?.commands?.strategy || oclifConfig.commands.strategy !== 'explicit') {
      logger.warn(`Oclif configuration in 'package.json' is not set to explicit command index. To use index file, set the oclif configuration to something like: {
        "oclif": {
          "commands": {
            "strategy": "explicit",
            "target": "./dist/index.js",
            "identifier": "COMMANDS"
          }
        }
      }`);
    }

    var identifier: string = 'COMMANDS'
    if (indexName === opts.IndexFileFlag['index-file'].default) {
      identifier = oclifConfig?.identifier || 'COMMANDS'
    }

    if (!fs.existsSync(commandsRoot)) {
      logger.error(`Commands directory '${commandsRoot}' not found`)
      process.exit(1)
    }

    const commandFiles: string[] = fs.readdirSync(commandsRoot, { recursive: true })
      .filter((file: string | Buffer) => file.toString().endsWith(sourceExtension))
      .map((file: string | Buffer) => file.toString())

    const imports: importInfo[] = []

    for (const [i, cmdFile] of commandFiles.entries()) {
      const cmdFilePath = path.join(commandsRoot, cmdFile)
      const cmdInfo = util.getCommandInfo(cmdFilePath)
      if (cmdInfo.className === "") {
        logger.warn(`File ${cmdFile} does not contain oclif command definition`)
        continue
      }

      const cmdKey = cmdFile.replaceAll(path.sep, ":").slice(0, -sourceExtension.length)

      var relativeImport = path.relative(indexDir, cmdFilePath)

      // js/ts 'import' statements have to start from './' or '../' to be relative
      if (!relativeImport.startsWith('.')) relativeImport = `.${path.sep}${relativeImport}`

      relativeImport = relativeImport.slice(0, -sourceExtension.length) // cut '.ts'/'.js' extension

      const importName = `Cmd${i}`

      if (cmdInfo.isDefaultExport) {
        imports.push({
          importLine: `import ${importName} from '${relativeImport}';`,
          indexLine: `'${cmdKey}': ${importName}`
        })
      } else {
        imports.push({
          importLine: `import { ${cmdInfo.className} as ${importName} } from '${relativeImport}';`,
          indexLine: `'${cmdKey}': ${importName}`
        })
      }
    }

    if (imports.length === 0) {
      logger.error(`No commands found in '${commandsRoot}'`)
      process.exit(1)
    }

    const importLines = imports.map((i: importInfo) => i.importLine)
    const commandLines = imports.map((i: importInfo) => i.indexLine)

    const indexContent = `${importLines.join('\n')}

// prettier-ignore
export const ${identifier} = {
  ${commandLines.join(',\n  ')}
};
`;

    fs.writeFileSync(indexName, indexContent);
    logger.info(`Index file generated at ${indexName}`);
  }
}

type importInfo = {
  importLine: string
  indexLine: string
}