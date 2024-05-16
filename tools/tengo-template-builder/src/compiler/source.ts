import { readFileSync } from 'node:fs';
import { TypedArtifactName, FullArtifactName } from './package';
import { ArtifactMap, createArtifactNameSet } from './artifactset';

// matches any valid name in tengo. Don't forget to use '\b' when needed to limit the boundaries!
const namePattern = '[_a-zA-Z][_a-zA-Z0-9]*';

const importPattern = /import\s*\(\s*"(?<moduleName>[^"]+)"\s*\)/;
const newGetTemplateIdRE = (moduleName: string) => {
  return new RegExp(`\\b${moduleName}\\.getTemplateId\\s*\\(\\s*"(?<templateName>[^"]+)"\\s*\\)`)
}
const newGetTemplateIdLineRE = (moduleName: string) => {
  return new RegExp(`\\b${moduleName}\\.getTemplateId\\s*\\(`)
}

const importRE = new RegExp(`\\b${importPattern.source}`);
const importNameRE = new RegExp(`\\b(?<importName>${namePattern}(\\.${namePattern})*)\\s*:=\\s*${importPattern.source}`)
const dependencyRE = /(?<pkgName>[^"]*):(?<depID>[^"]+)/ // use it to parse <moduleName> from importPattern or <templateName> акщь getTemplateID

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

export function parseSourceFile(srcFile: string, fullSourceName: FullArtifactName): ArtifactSource {
  const src = readFileSync(srcFile).toString()
  const { deps } = parseSourceData(src, fullSourceName)

  return new ArtifactSource(fullSourceName, src, srcFile, deps.array);
}

export function parseSource(src: string, fullSourceName: FullArtifactName): ArtifactSource {
  const { deps } = parseSourceData(src, fullSourceName)

  return new ArtifactSource(fullSourceName, src, "", deps.array);
}

function parseSourceData(src: string, fullSourceName: FullArtifactName): { deps: ArtifactMap<TypedArtifactName> } {
  const dependencySet = createArtifactNameSet();

  // iterating over lines
  const lines = src.split('\n');
  // // and creating normalized output
  // const processedLines: string[] = [];
  let getTemplateIdRE : RegExp | undefined
  let getTemplateIdLineRE : RegExp | undefined

  let lineNo = 0;
  for (const line of lines) {
    lineNo++;

    try {
      if (importRE.test(line)) {
        const result = parseLibraryImport(line)
        
        if (!result) {
          continue
        }

        if (typeof result == 'string') {
          getTemplateIdRE = newGetTemplateIdRE(result)
          getTemplateIdLineRE = newGetTemplateIdLineRE(result)
        } else {
          dependencySet.add(result)
        }

        continue
      }

      if (getTemplateIdLineRE && getTemplateIdLineRE.test(line)) {
        const result = parseTemplateUse(getTemplateIdRE!, line)
        if (result) {
          dependencySet.add(result)
        }

        continue
      }
      
    } catch (error: any) {
      throw new Error(`[line ${lineNo}]: ${error.message}\n\t${line}`);
    }
  }

  return {
    deps: dependencySet
  }
}

function parseLibraryImport(line: string): TypedArtifactName | string {
  const match = importNameRE.exec(line)

  if (!match || !match.groups) {
    throw Error(`failed to parse 'import' statement`)
  }

  const { importName, moduleName } = match.groups
  if (!importName || !moduleName) {
    throw Error(`failed to parse 'import' statement`)
  }

  if (moduleName == "plapi") {
    return importName
  }

  const depInfo = dependencyRE.exec(moduleName)
  if (!depInfo) {
    return ""
  }

  if (!depInfo.groups) {
    throw Error(`failed to parse dependency name inside 'import' statement. The dependency name should have format '<package>:<templateName>'`)
  }

  const { pkgName, depID } = depInfo.groups
  if (!pkgName || !depID) {
    throw Error(`failed to parse dependency name inside 'import' statement. The dependency name should have format '<package>:<templateName>'`)
  }

  return { type: 'library', pkg: pkgName, id: depID }
}

function parseTemplateUse(re: RegExp, line: string): TypedArtifactName | undefined {
  const match = re.exec(line)

  if (!match || !match.groups) {
    throw Error(`failed to parse 'getTemplateId' statement`)
  }

  const { templateName } = match.groups
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

  return { type: 'template', pkg: pkgName, id: depID }
}
