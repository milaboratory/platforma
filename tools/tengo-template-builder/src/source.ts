import { ArtefactId, artefactKey, ArtefactSource, ArtefactType, FullArtefactId, PackageId } from './package';

const getTemplateCheck = /getTemplate\s*\(/;
const getTemplatePattern = /getTemplate\s*\(\s*"([^"]*):([^"]+)"\s*\)/;

function renderGetTemplate(pkg: string, name: string): string {
  return `getTemplate("${pkg}:${name}")`;
}

const importCheck = /import\s*\(\s*"[^"]*:/;
const importPattern = /import\s*\(\s*"([^"]*):([^"]+)"\s*\)/;

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

export function parseSource(src: string, sourceId: FullArtefactId): ArtefactSource {
  const dependenciesSet = new Set<string>();
  const dependenciesArray: ArtefactId[] = [];

  const lines = src.split('\n');
  const processedLines: string[] = [];
  let lineNumber = 0;
  for (const line of lines) {
    lineNumber++;
    let newLine = line;
    for (const dt of dependencyTypes) {
      let matched = false;
      newLine = newLine.replace(dt.pattern, (substring, _pkg, name) => {
        matched = true;
        const pkg = _pkg === '' ? sourceId.pkg : _pkg;
        // adding dependency to the set
        const artefactId: ArtefactId = { type: dt.artefactType, pkg, name };
        const key = artefactKey(artefactId);
        if (!dependenciesSet.has(key)) {
          dependenciesSet.add(key);
          dependenciesArray.push(artefactId);
        }
        return dt.render(pkg, name);
      });
      if (!matched && newLine.match(dt.check))
        // checkin that we don't miss some incomplete reference
        throw new Error(`Can't parse reference to ${dt.artefactType} in line (${lineNumber}): ${line}`);
    }

    processedLines.push(newLine);
  }

  return new ArtefactSource(sourceId, processedLines.join('\n'), dependenciesArray);
}

