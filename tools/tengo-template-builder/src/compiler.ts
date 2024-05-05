import { ArtifactSource } from './source';
import { Template } from './template';
import { ArtifactName, artifactKey, fullNameToString, nameToString } from './package';
import { ArtifactMap } from './artifactset';

export class TengoTemplateCompiler {
  private readonly libs = new ArtifactMap<ArtifactSource>(src => src.fullName);
  private readonly templates = new ArtifactMap<Template>(tpl => tpl.fullName);

  addTemplate(tpl: Template) {
    const tplFromMap = this.templates.add(tpl, false);
    if (tplFromMap)
      throw new Error(
        `compiler already contain such template: adding = ${fullNameToString(tpl.fullName)}, contains = ${fullNameToString(tplFromMap.fullName)}`
      );
  }

  addLib(lib: ArtifactSource) {
    const libFromMap = this.libs.add(lib, false);
    if (libFromMap)
      throw new Error(
        `compiler already contain such library: adding = ${fullNameToString(lib.fullName)}, contains = ${fullNameToString(libFromMap.fullName)}`
      );
  }

  getTemplate(name: ArtifactName): Template | undefined {
    if (name.type !== 'template')
      throw new Error('illegal name type');
    return this.templates.get(name);
  }

  getLib(name: ArtifactName): ArtifactSource | undefined {
    if (name.type !== 'library')
      throw new Error('illegal name type');
    return this.libs.get(name);
  }

  checkLibs() {
    this.libs.forEach(lib => {
      for (const dep of lib.dependencies) {
        if ((dep.type === 'template' && !this.getTemplate(dep))
          || (dep.type === 'library' && !this.getLib(dep)))
          throw new Error(`unresolved dependency ${nameToString(dep)} for ${fullNameToString(lib.fullName)}`);
      }
    });
  }

  compileAndAdd(sources: ArtifactSource[]) {

  }
}
