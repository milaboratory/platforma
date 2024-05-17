import { readFileSync } from 'node:fs';
import { TypedArtifactName, FullArtifactName, ArtifactType } from './package';
import { ArtifactMap, createArtifactNameSet } from './artifactset';

// matches any valid name in tengo. Don't forget to use '\b' when needed to limit the boundaries!
const namePattern = '[_a-zA-Z][_a-zA-Z0-9]*';

const newGetTemplateIdRE = (moduleName: string) => {
  return new RegExp(`\\b${moduleName}\\.(?<templateUse>getTemplateId\\s*\\(\\s*"(?<templateName>[^"]+)"\\s*\\))`)
}

const importRE = /\s*:=\s*import\s*\(\s*"(?<moduleName>[^"]+)"\s*\)/;
const importNameRE = new RegExp(`\\b(?<importName>${namePattern}(\\.${namePattern})*)${importRE.source}`)
const dependencyRE = /(?<pkgName>[^"]+)?:(?<depID>[^"]+)/ // use it to parse <moduleName> from importPattern or <templateName> акщь getTemplateID


export class ArtifactSource {
  constructor(
    /** Full artifact id, including package version */
    public readonly fullName: FullArtifactName,
    /** Normalized source code */
    public readonly src: string,
    /** Path to source file where artifact came from */
    public readonly srcName: string,
    /** List of dependencies */
    public readonly dependencies: TypedArtifactName[],
  ) { }
}

export function parseSourceFile(srcFile: string, fullSourceName: FullArtifactName, normalize: boolean): ArtifactSource {
  const src = readFileSync(srcFile).toString()
  const { deps, normalized } = parseSourceData(src, fullSourceName, normalize)

  return new ArtifactSource(fullSourceName, normalized, srcFile, deps.array);
}

export function parseSource(src: string, fullSourceName: FullArtifactName, normalize: boolean): ArtifactSource {
  const { deps, normalized } = parseSourceData(src, fullSourceName, normalize)

  return new ArtifactSource(fullSourceName, normalized, "", deps.array);
}

function parseSourceData(src: string, fullSourceName: FullArtifactName, globalizeImports: boolean): {
  normalized: string,
  deps: ArtifactMap<TypedArtifactName>
} {
  const dependencySet = createArtifactNameSet();

  // iterating over lines
  const lines = src.split('\n');

  // processedLines keep all the original lines from <src>.
  // If <globalizeImport>==true, the parser modifies 'import' and 'getTemplateId' lines 
  // with Platforma Tengo lib and template usages, resolving local names (":<item>") to 
  // global ("@milaboratory/pkg:<item>")
  const processedLines: string[] = [];
  let getTemplateIdRE: RegExp | undefined

  let lineNo = 0;
  for (const line of lines) {
    lineNo++;

    try {
      const result = parseSingleSourceLine(line, getTemplateIdRE, fullSourceName.pkg, globalizeImports)
      processedLines.push(result.line)
      if (result.getTemplateIdRE) {
        getTemplateIdRE = result.getTemplateIdRE
      }
      if (result.artifact) {
        dependencySet.add(result.artifact)
      }
    } catch (error: any) {
      throw new Error(`[line ${lineNo}]: ${error.message}\n\t${line}`);
    }
  }

  return {
    normalized: processedLines.join("\n"),
    deps: dependencySet
  }
}

function parseSingleSourceLine(line: string, getTemplateIdRE: RegExp | undefined, localPackageName: string, globalizeImports: boolean): {
  line: string,
  getTemplateIdRE: RegExp | undefined,
  artifact: TypedArtifactName | undefined,
} {
  const importInstruction = importRE.exec(line)

  if (importInstruction) {
    const iInfo = parseImport(line)

    if (iInfo.module == "plapi") {
      getTemplateIdRE = newGetTemplateIdRE(iInfo.alias)
      return { line, getTemplateIdRE, artifact: undefined }
    }

    const artifact = parseArtifactName(iInfo.module, 'library', localPackageName)
    if (!artifact) {
      // not a Platforma Tengo library import
      return { line, getTemplateIdRE, artifact: undefined }
    }

    if (globalizeImports) {
      line = line.replace(importInstruction[0],
        ` := import("${artifact.pkg}:${artifact.id}")`)
    }

    return { line, getTemplateIdRE, artifact }
  }

  if (getTemplateIdRE) {
    const match = getTemplateIdRE.exec(line)
    if (!match || !match.groups) {
      return { line, getTemplateIdRE, artifact: undefined }
    }

    const { templateUse, templateName } = match.groups

    if (!templateUse || !templateName) {
      throw Error(`failed to parse getTemplateId statement`)
    }

    // const artifact
    const artifact = parseArtifactName(templateName, 'template', localPackageName)
    if (!artifact) {
      throw Error(`failed to parse getTemplateId statement`)
    }


    if (globalizeImports) {
      line = line.replace(templateUse,
        `getTemplateId("${artifact.pkg}:${artifact.id}")`)
    }

    return { line, getTemplateIdRE, artifact }
  }

  return { line, getTemplateIdRE, artifact: undefined }
}

interface ImportInfo {
  module: string // the module name without wrapping quotes: import("<module>")
  alias: string // the name of variable that keeps imported module: <alias> := import("<module>")
}

function parseImport(line: string): ImportInfo {
  const match = importNameRE.exec(line)

  if (!match || !match.groups) {
    throw Error(`failed to parse 'import' statement`)
  }

  const { importName, moduleName } = match.groups
  if (!importName || !moduleName) {
    throw Error(`failed to parse 'import' statement`)
  }

  return {
    module: moduleName,
    alias: importName,
  }
}

function parseArtifactName(moduleName: string, aType: ArtifactType, localPackageName: string): TypedArtifactName | undefined {
  const depInfo = dependencyRE.exec(moduleName)
  if (!depInfo) {
    return
  }

  if (!depInfo.groups) {
    throw Error(`failed to parse dependency name inside 'import' statement. The dependency name should have format '<package>:<templateName>'`)
  }

  const { pkgName, depID } = depInfo.groups
  if (!depID) {
    throw Error(`failed to parse dependency name inside 'import' statement. The dependency name should have format '<package>:<templateName>'`)
  }

  return { type: aType, pkg: pkgName ?? localPackageName, id: depID }
}

function parseTemplateUse(match: RegExpExecArray, localPackageName: string): TypedArtifactName {
  const { templateName } = match.groups!

  if (!templateName) {
    throw Error(`failed to parse 'getTemplateId' statement`)
  }

  const depInfo = dependencyRE.exec(templateName)
  if (!depInfo || !depInfo.groups) {
    throw Error(`failed to parse dependency name inside 'getTemplateId' statement. The dependency name should have format '<package>:<templateName>'`)
  }

  const { pkgName, depID } = depInfo.groups
  if (!pkgName || !depID) {
    throw Error(`failed to parse dependency name inside 'getTemplateId' statement. The dependency name should have format '<package>:<templateName>'`)
  }

  return { type: 'template', pkg: pkgName ?? localPackageName, id: depID }
}
