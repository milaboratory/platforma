import { ArtefactId, artefactKey, ArtefactType, FullArtefactId } from './package';
import { ArtefactMap, createArtefactIdSet } from './idset';

const getTemplateCheck = /getTemplate\s*\(/;
const getTemplatePattern = /getTemplate\s*\(\s*"([^"]*):([^"]+)"\s*\)/g;

function renderGetTemplate(pkg: string, name: string): string {
  return `getTemplate("${pkg}:${name}")`;
}

const importCheck = /import\s*\(\s*"[^"]*:/;
const importPattern = /import\s*\(\s*"([^"]*):([^"]+)"\s*\)/g;

function renderImport(pkg: string, name: string): string {
  return `import("${pkg}:${name}")`;
}

interface Dependency {
  artefactType: ArtefactType;
  pattern: RegExp;
  check: RegExp;
  render: (pkg: string, name: string) => string;
}

const dependencyTypes: Dependency[] = [
  { artefactType: 'template', pattern: getTemplatePattern, check: getTemplateCheck, render: renderGetTemplate },
  { artefactType: 'library', pattern: importPattern, check: importCheck, render: renderImport }
];

export class ArtefactSource {
  constructor(
    /** Full artefact id, including package version */
    public readonly id: FullArtefactId,
    /** Normalized source code */
    public readonly src: string,
    /** List of dependencies */
    public readonly dependencies: ArtefactId[]) {
  }
}

export function parseSource(src: string, sourceId: FullArtefactId, normalize: boolean): ArtefactSource {
  const dependencySet = createArtefactIdSet();

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
            pkg = sourceId.pkg;
          else
            throw new Error(`package not specified for ${dt.artefactType}: ${substring}`);
        }

        // adding dependency to the set
        dependencySet.add({ type: dt.artefactType, pkg, name }, false);

        return normalize
          // if normalization is requested, we re-render corresponding statement
          ? dt.render(pkg, name)
          // if not, keep the substring unchanged
          : substring;
      });

      if (!matched && newLine.match(dt.check))
        // checkin that we don't miss some unexpectedly formatted reference
        throw new Error(`Can't parse reference to ${dt.artefactType} in line (${lineNumber}): ${line}`);
    }

    // assert line === newLine || normalize

    // adding line to the output code
    processedLines.push(newLine);
  }

  return new ArtefactSource(sourceId, processedLines.join('\n'), dependencySet.array);
}

