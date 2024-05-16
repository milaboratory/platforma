import { readFileSync } from 'node:fs';
import { TypedArtifactName, artifactKey, ArtifactType, FullArtifactName } from './package';
import { ArtifactMap, createArtifactNameSet } from './artifactset';

const getTemplateIdCheck = /plapi.getTemplateId\s*\(/;
const getTemplateIdPattern = /plapi.getTemplateId\s*\(\s*"([^"]*):([^"]+)"\s*\)/g;

function renderGetTemplateId(pkg: string, name: string): string {
  return `plapi.getTemplateId("${pkg}:${name}")`;
}

const importCheck = /import\s*\(\s*"[^"]*:/;
const importPattern = /import\s*\(\s*"([^"]*):([^"]+)"\s*\)/g;

function renderImport(pkg: string, name: string): string {
  return `import("${pkg}:${name}")`;
}

interface Dependency {
  type: ArtifactType;
  pattern: RegExp;
  check: RegExp;
  render: (pkg: string, name: string) => string;
}

const dependencyTypes: Dependency[] = [
  { type: 'template', pattern: getTemplateIdPattern, check: getTemplateIdCheck, render: renderGetTemplateId },
  { type: 'library', pattern: importPattern, check: importCheck, render: renderImport }
];

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
  const { normalized, deps } = parseSourceData(src, fullSourceName, normalize)

  return new ArtifactSource(fullSourceName, normalized, srcFile, deps.array);
}

export function parseSource(src: string, fullSourceName: FullArtifactName, normalize: boolean): ArtifactSource {
  const { normalized, deps } = parseSourceData(src, fullSourceName, normalize)

  return new ArtifactSource(fullSourceName, normalized, "", deps.array);
}

function parseSourceData(src: string, fullSourceName: FullArtifactName, normalize: boolean): { normalized: string, deps: ArtifactMap<TypedArtifactName> } {
  const dependencySet = createArtifactNameSet();

  // iterating over lines
  const lines = src.split('\n');
  // and creating normalized output
  const processedLines: string[] = [];
  let lineNumber = 0;
  for (const line of lines) {
    lineNumber++;
    let newLine = line;
    for (const dt of dependencyTypes) {

      // will prevent incomplete statement checks below
      let matched = false;

      // iterate over template or lib references and replace them with
      // normalized statements, if requested by normalize flag
      newLine = newLine.replace(dt.pattern, (substring, _pkg, name) => {
        matched = true;

        // normalizing package name, if requested, or validating that it is specified
        let pkg = _pkg;
        if (pkg === '') {
          if (normalize)
            pkg = fullSourceName.pkg;
          else
            throw new Error(`package not specified for ${dt.type}: ${substring}`);
        }

        // adding dependency to the set
        dependencySet.add({ type: dt.type, pkg, id: name }, false);

        return normalize
          // if normalization is requested, we re-render corresponding statement
          ? dt.render(pkg, name)
          // if not, keep the substring unchanged
          : substring;
      });

      if (!matched && newLine.match(dt.check))
        // checkin that we don't miss some unexpectedly formatted reference
        throw new Error(`Can't parse reference to ${dt.type} in line (${lineNumber}): ${line}`);
    }

    // assert line === newLine || normalize

    // adding line to the output code
    processedLines.push(newLine);
  }

  return {
    normalized: processedLines.join('\n'),
    deps: dependencySet
  }
}

