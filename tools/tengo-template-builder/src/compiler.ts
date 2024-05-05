import { ArtefactSource } from './source';
import { Template } from './template';
import { ArtefactId, artefactKey, fullIdToString, idToString } from './package';
import { ArtefactMap } from './idset';

export class TengoTemplateCompiler {
  private readonly libs = new ArtefactMap<ArtefactSource>(src => src.id);
  private readonly templates = new ArtefactMap<Template>(tpl => tpl.id);

  addTemplate(tpl: Template) {
    const tplFromMap = this.templates.add(tpl, false);
    if (tplFromMap)
      throw new Error(
        `compiler already contain such template: adding = ${fullIdToString(tpl.id)}, contains = ${fullIdToString(tplFromMap.id)}`
      );
  }

  addLib(lib: ArtefactSource) {
    const libFromMap = this.libs.add(lib, false);
    if (libFromMap)
      throw new Error(
        `compiler already contain such library: adding = ${fullIdToString(lib.id)}, contains = ${fullIdToString(libFromMap.id)}`
      );
  }

  getTemplate(id: ArtefactId): Template | undefined {
    if (id.type !== 'template')
      throw new Error('illegal id type');
    return this.templates.get(id);
  }

  getLib(id: ArtefactId): ArtefactSource | undefined {
    if (id.type !== 'library')
      throw new Error('illegal id type');
    return this.libs.get(id);
  }

  checkLibs() {
    this.libs.forEach(lib => {
      for (const dep of lib.dependencies) {
        if ((dep.type === 'template' && !this.getTemplate(dep))
          || (dep.type === 'library' && !this.getLib(dep)))
          throw new Error(`unresolved dependency ${idToString(dep)} for ${fullIdToString(lib.id)}`);
      }
    });
  }
}
