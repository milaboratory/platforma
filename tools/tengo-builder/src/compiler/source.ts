import { readFileSync } from 'node:fs';
import {
  type TypedArtifactName,
  type FullArtifactName,
  type ArtifactType,
  type CompileMode,
  type CompilerOption,
  fullNameToString,
} from './package';
import type { ArtifactMap } from './artifactset';
import { createArtifactNameSet } from './artifactset';
import { createHash } from 'node:crypto';
import type { MiLogger } from '@milaboratories/ts-helpers';

// matches any valid name in tengo. Don't forget to use '\b' when needed to limit the boundaries!
const namePattern = '[_a-zA-Z][_a-zA-Z0-9]*';

const functionCallRE = (moduleName: string, fnName: string) => {
  return new RegExp(
    `\\b${moduleName}\\.(?<fnCall>(?<fnName>`
    + fnName
    + `)\\s*\\(\\s*"(?<templateName>[^"]+)"\\s*\\))`,
  );
};

export const newGetTemplateIdRE = (moduleName: string) => {
  return functionCallRE(moduleName, 'getTemplateId');
};
export const newGetSoftwareInfoRE = (moduleName: string) => {
  return functionCallRE(moduleName, 'getSoftwareInfo');
};

const newImportTemplateRE = (moduleName: string) => {
  return functionCallRE(moduleName, 'importTemplate');
};
const newImportSoftwareRE = (moduleName: string) => {
  return functionCallRE(moduleName, 'importSoftware');
};
const newImportAssetRE = (moduleName: string) => {
  return functionCallRE(moduleName, 'importAsset');
};

const emptyLineRE = /^\s*$/;
const compilerOptionRE = /^\/\/tengo:[\w]/;
const wrongCompilerOptionRE = /^\s*\/\/\s*tengo:\s*./;
const inlineCommentRE = /\/\*.*?\*\//g; // .*? = non-greedy search
const singlelineCommentRE = /^\s*(\/\/)/;
const multilineCommentStartRE = /^\s*\/\*/;
const multilineCommentEndRE = /\*\//;

// import could only be an assignment in a statement,
// other ways could break a compilation.
const importRE = /\s*:=\s*import\s*\(\s*"(?<moduleName>[^"]+)"\s*\)/;
const importNameRE = new RegExp(
  `\\b(?<importName>${namePattern}(\\.${namePattern})*)${importRE.source}`,
);
const dependencyRE = /(?<pkgName>[^"]+)?:(?<depID>[^"]+)/; // use it to parse <moduleName> from importPattern or <templateName> from getTemplateID

/**
 * Parse compiler option string representation
 * Compiler option line is a comment starting with '//tengo:', say
 *   //tengo:hash_override tralala
 *
 * The common compiler option syntax is:
 *  //tengo:<option name> [<option arg1> [<option arg 2> [...]]]
 */
const parseComplierOption = (opt: string): CompilerOption => {
  const parts = opt.split(' ');
  const namePart = parts[0].split(':');
  if (namePart.length != 2) {
    throw new Error(
      'compiler option format is wrong: expect to have option name after \'tengo:\' prefix, like \'tengo:MyOption\'',
    );
  }
  const optName = namePart[1];

  return {
    name: optName,
    args: parts.slice(1),
  };
};

export class ArtifactSource {
  constructor(
    /** The mode this artifact was built (dev or dist) */
    public readonly compileMode: CompileMode,
    /** Full artifact id, including package version */
    public readonly fullName: FullArtifactName,
    /** Hash of the source code */
    public readonly sourceHash: string,
    /** Normalized source code */
    public readonly src: string,
    /** Path to source file where artifact came from */
    public readonly srcName: string,
    /** List of dependencies */
    public readonly dependencies: TypedArtifactName[],
    /** Additional compiler options detected in source code */
    public readonly compilerOptions: CompilerOption[],
  ) {}
}

export function parseSourceFile(
  logger: MiLogger,
  mode: CompileMode,
  srcFile: string,
  fullSourceName: FullArtifactName,
  normalize: boolean,
): ArtifactSource {
  const src = readFileSync(srcFile).toString();
  const { deps, normalized, opts } = parseSourceData(logger, src, fullSourceName, normalize);

  return new ArtifactSource(
    mode,
    fullSourceName,
    getSha256(normalized),
    normalized,
    srcFile,
    deps.array,
    opts,
  );
}

export function parseSource(
  logger: MiLogger,
  mode: CompileMode,
  src: string,
  fullSourceName: FullArtifactName,
  normalize: boolean,
): ArtifactSource {
  const { deps, normalized, opts } = parseSourceData(logger, src, fullSourceName, normalize);

  return new ArtifactSource(mode, fullSourceName, getSha256(normalized), normalized, '', deps.array, opts);
}

/**
 * Reads src
 * returns normalized source code,
 * gets dependencies from imports,
 * maps imports to global names if globalizeImports is true,
 * and collects compiler options like hashOverride.
 */
function parseSourceData(
  logger: MiLogger,
  src: string,
  fullSourceName: FullArtifactName,
  globalizeImports: boolean,
): {
    normalized: string;
    deps: ArtifactMap<TypedArtifactName>;
    opts: CompilerOption[];
  } {
  const dependencySet = createArtifactNameSet();
  const optionList: CompilerOption[] = [];

  // iterating over lines
  const lines = src.split('\n');

  // processedLines keep all the original lines from <src>.
  // If <globalizeImport>==true, the parser modifies 'import' and 'getTemplateId' lines
  // with Platforma Tengo lib and template usages, resolving local names (":<item>") to
  // global ("@milaboratory/pkg:<item>")
  const processedLines: string[] = [];
  let parserContext: sourceParserContext = {
    isInCommentBlock: false,
    canDetectOptions: true,
    tplDepREs: new Map<string, [ArtifactType, RegExp][]>(),
    lineNo: 0,
  };

  for (const line of lines) {
    parserContext.lineNo++;

    try {
      const { line: processedLine, context: newContext, artifact, option } = parseSingleSourceLine(
        logger,
        line,
        parserContext,
        fullSourceName.pkg,
        globalizeImports,
      );
      processedLines.push(processedLine);
      parserContext = newContext;

      if (artifact) {
        dependencySet.add(artifact);
      }
      if (option) {
        optionList.push(option);
      }
    } catch (error: unknown) {
      const err = error as Error;
      throw new Error(`[line ${parserContext.lineNo} in ${fullNameToString(fullSourceName)}]: ${err.message}\n\t${line}`, { cause: err });
    }
  }

  return {
    normalized: processedLines.join('\n'),
    deps: dependencySet,
    opts: optionList,
  };
}

interface sourceParserContext {
  isInCommentBlock: boolean;
  canDetectOptions: boolean;
  tplDepREs: Map<string, [ArtifactType, RegExp][]>;
  lineNo: number;
}

export function parseSingleSourceLine(
  logger: MiLogger,
  line: string,
  context: sourceParserContext,
  localPackageName: string,
  globalizeImports?: boolean,
): {
    line: string;
    context: sourceParserContext;
    artifact: TypedArtifactName | undefined;
    option: CompilerOption | undefined;
  } {
  // preprocess line and remove inline comments
  line = line.replaceAll(inlineCommentRE, '');

  if (context.isInCommentBlock) {
    if (multilineCommentEndRE.exec(line)) {
      context.isInCommentBlock = false;
    }
    return { line: '', context, artifact: undefined, option: undefined };
  }

  if (compilerOptionRE.exec(line)) {
    if (!context.canDetectOptions) {
      logger.error(
        `[line ${context.lineNo}]: compiler option '//tengo:' was detected, but it cannot be applied as compiler options can be set only at the file header, before any code line'`,
      );
      throw new Error('tengo compiler options (\'//tengo:\' comments) can be set only in file header');
    }
    return { line, context, artifact: undefined, option: parseComplierOption(line) };
  }

  if (wrongCompilerOptionRE.exec(line) && context.canDetectOptions) {
    logger.warn(
      `[line ${context.lineNo}]: text simillar to compiler option ('//tengo:...') was detected, but it has wrong format. Leave it as is, if you did not mean to use a line as compiler option. Or format it to '//tengo:<option>' otherwise (no spaces between '//' and 'tengo', no spaces between ':' and option name)`,
    );
    return { line, context, artifact: undefined, option: undefined };
  }

  if (singlelineCommentRE.test(line)) {
    return { line: '', context, artifact: undefined, option: undefined };
  }

  if (multilineCommentStartRE.exec(line)) {
    context.isInCommentBlock = true;
    return { line: '', context, artifact: undefined, option: undefined };
  }

  if (line.includes('/*')) {
    throw new Error('malformed multiline comment');
  }

  if (emptyLineRE.exec(line)) {
    return { line, context, artifact: undefined, option: undefined };
  }

  // options could be only at the top of the file.
  context.canDetectOptions = false;

  const importInstruction = importRE.exec(line);

  if (importInstruction) {
    const iInfo = parseImport(line);

    // If we have plapi, ll or assets, then try to parse
    // getTemplateId, getSoftwareInfo, getSoftware and getAsset calls.

    if (iInfo.module === 'plapi') {
      if (!context.tplDepREs.has(iInfo.module)) {
        context.tplDepREs.set(iInfo.module, [
          ['template', newGetTemplateIdRE(iInfo.alias)],
          ['software', newGetSoftwareInfoRE(iInfo.alias)],
        ]);
      }
      return { line, context, artifact: undefined, option: undefined };
    }

    if (
      iInfo.module === '@milaboratory/tengo-sdk:ll'
      || iInfo.module === '@platforma-sdk/workflow-tengo:ll'
      || ((localPackageName === '@milaboratory/tengo-sdk'
        || localPackageName === '@platforma-sdk/workflow-tengo')
      && iInfo.module === ':ll')
    ) {
      if (!context.tplDepREs.has(iInfo.module)) {
        context.tplDepREs.set(iInfo.module, [
          ['template', newImportTemplateRE(iInfo.alias)],
          ['software', newImportSoftwareRE(iInfo.alias)],
        ]);
      }
    }

    if (
      iInfo.module === '@milaboratory/tengo-sdk:assets'
      || iInfo.module === '@platforma-sdk/workflow-tengo:assets'
      || ((localPackageName === '@milaboratory/tengo-sdk'
        || localPackageName === '@platforma-sdk/workflow-tengo')
      && iInfo.module === ':assets')
    ) {
      if (!context.tplDepREs.has(iInfo.module)) {
        context.tplDepREs.set(iInfo.module, [
          ['template', newImportTemplateRE(iInfo.alias)],
          ['software', newImportSoftwareRE(iInfo.alias)],
          ['asset', newImportAssetRE(iInfo.alias)],
        ]);
      }
    }

    const artifact = parseArtifactName(iInfo.module, 'library', localPackageName);
    if (!artifact) {
      // not a Platforma Tengo library import
      return { line, context, artifact: undefined, option: undefined };
    }

    if (globalizeImports) {
      line = line.replace(importInstruction[0], ` := import("${artifact.pkg}:${artifact.id}")`);
    }

    return { line, context, artifact, option: undefined };
  }

  if (context.tplDepREs.size > 0) {
    for (const [_, artifactRE] of context.tplDepREs) {
      for (const [artifactType, re] of artifactRE) {
        const match = re.exec(line);
        if (!match || !match.groups) {
          continue;
        }

        const { fnCall, templateName, fnName } = match.groups;

        if (!fnCall || !templateName || !fnName) {
          throw Error(`failed to parse template import statement`);
        }

        const artifact = parseArtifactName(templateName, artifactType, localPackageName);
        if (!artifact) {
          throw Error(`failed to parse artifact name in ${fnName} import statement`);
        }

        if (globalizeImports) {
          line = line.replace(fnCall, `${fnName}("${artifact.pkg}:${artifact.id}")`);
        }

        return { line, context, artifact, option: undefined };
      }
    }
  }

  return { line, context, artifact: undefined, option: undefined };
}

interface ImportInfo {
  module: string; // the module name without wrapping quotes: import("<module>")
  alias: string; // the name of variable that keeps imported module: <alias> := import("<module>")
}

function parseImport(line: string): ImportInfo {
  const match = importNameRE.exec(line);

  if (!match || !match.groups) {
    throw Error(`failed to parse 'import' statement`);
  }

  const { importName, moduleName } = match.groups;
  if (!importName || !moduleName) {
    throw Error(`failed to parse 'import' statement`);
  }

  return {
    module: moduleName, // the module name without wrapping quotes: import("<module>")
    alias: importName, // the name of variable that keeps imported module: <alias> := import("<module>")
  };
}

function parseArtifactName(
  moduleName: string,
  aType: ArtifactType,
  localPackageName: string,
): TypedArtifactName | undefined {
  const depInfo = dependencyRE.exec(moduleName);
  if (!depInfo) {
    return;
  }

  if (!depInfo.groups) {
    throw Error(
      `failed to parse dependency name inside 'import' statement. The dependency name should have format '<package>:<templateName>'`,
    );
  }

  const { pkgName, depID } = depInfo.groups;
  if (!depID) {
    throw Error(
      `failed to parse dependency name inside 'import' statement. The dependency name should have format '<package>:<templateName>'`,
    );
  }

  return { type: aType, pkg: pkgName ?? localPackageName, id: depID };
}

export function getSha256(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}
