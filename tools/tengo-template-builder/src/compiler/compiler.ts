import { ArtifactSource } from './source';
import { Template, TemplateData } from './template';
import {
  TypedArtifactName,
  artifactKey,
  fullNameToString,
  typedArtifactNameToString,
  artifactNameToString,
  formatArtefactNameAndVersion, typedArtifactNamesEquals, FullArtifactName,
  CompileMode
} from './package';
import { ArtifactStore } from './artifactset';
import { assertNever } from './util';

export interface TemplatesAndLibs {
  templates: Template[],
  libs: ArtifactSource[],
  software: ArtifactSource[]
}

export class TengoTemplateCompiler {
  constructor(
    private readonly compileMode: CompileMode
  ) { }

  private readonly libs = new ArtifactStore<ArtifactSource>(src => src.fullName);
  private readonly software = new ArtifactStore<ArtifactSource>(src => src.fullName);
  private readonly templates = new ArtifactStore<Template>(tpl => tpl.fullName);

  private populateTemplateDataFromDependencies(fullName: FullArtifactName,
                                               data: TemplateData,
                                               deps: TypedArtifactName[],
                                               trace: string[]) {
    for (const dep of deps) {
      switch (dep.type) {
        case 'library':
          const lib = this.getLibOrError(dep);

          const recursionStart = trace.indexOf(artifactNameToString(dep))
          if (recursionStart >= 0) {
            let errorMessage = `library import recursion detected: ${trace.slice(recursionStart).join(" -> ")} -> ${artifactNameToString(dep)}`
            throw new Error(errorMessage)
          }

          data.libs[artifactNameToString(dep)] = {
            ...formatArtefactNameAndVersion(lib.fullName),
            src: lib.src
          };

          // populate with transient library dependencies
          this.populateTemplateDataFromDependencies(fullName, data, lib.dependencies, [...trace, artifactNameToString(dep)]);

          break;
        case 'software':
          const software = this.getSoftwareOrError(dep);
          data.software[artifactNameToString(dep)] = {
            ...formatArtefactNameAndVersion(software.fullName),
            src: software.src
          }

          break;
        case 'template':
          if (typedArtifactNamesEquals(fullName, dep))
            // skipping self reference
            continue;

          const tpl = this.getTemplateOrError(dep);
          data.templates[artifactNameToString(dep)] = tpl.data;
          break;
        case 'test':
          throw new Error(
            `dependencies tree error: tests should never be part of template: ${typedArtifactNameToString(dep)} is dependency of ${artifactNameToString(fullName)}`,
          )
        default:
          assertNever(dep.type);
      }
    }
  }

  /** This method assumes that all dependencies are already added to the compiler's context */
  private compileAndAddTemplate(tplSrc: ArtifactSource): Template {
    if (tplSrc.fullName.type !== 'template')
      throw new Error('unexpected source type');

    // creating template with unpopulated dependencies
    const tplData: TemplateData = {
      type: 'pl.tengo-template.v2',
      ...formatArtefactNameAndVersion(tplSrc.fullName),
      templates: {},
      libs: {},
      software: {},
      src: tplSrc.src
    };

    // collecting dependencies in output format
    this.populateTemplateDataFromDependencies(tplSrc.fullName, tplData, tplSrc.dependencies, []);

    const tpl = new Template(tplSrc.compileMode, tplSrc.fullName, { data: tplData });
    this.addTemplate(tpl);
    return tpl;
  }

  addLib(lib: ArtifactSource) {
    const libFromMap = this.libs.add(lib.compileMode, lib, false)
    if (libFromMap)
      throw new Error(
        `compiler already contain such library: adding = ${fullNameToString(lib.fullName)}, contains = ${fullNameToString(libFromMap.fullName)}`
      );
  }

  allLibs(): ArtifactSource[] {
    return this.libs.array(this.compileMode)
  }

  getLib(name: TypedArtifactName): ArtifactSource | undefined {
    if (name.type !== 'library')
      throw new Error(`illegal artifact type: got ${name.type} instead of 'library`);
    return this.libs.get(this.compileMode, name);
  }

  getLibOrError(name: TypedArtifactName): ArtifactSource {
    const lib = this.getLib(name);
    if (!lib)
      throw new Error(`library not found: ${artifactNameToString(name)}`);
    return lib;
  }

  addSoftware(software: ArtifactSource) {
    const swFromMap = this.software.add(software.compileMode, software, false)
    if (swFromMap)
      throw new Error(
        `compiler already contain info for software: adding = ${fullNameToString(software.fullName)}, contains = ${fullNameToString(swFromMap.fullName)}`
      );
  }

  getSoftware(name: TypedArtifactName): ArtifactSource | undefined {
    if (name.type !== 'software')
      throw new Error(`illegal artifact type: got ${name.type} instead of 'software`);

    return this.software.get(this.compileMode, name);
  }

  getSoftwareOrError(name: TypedArtifactName): ArtifactSource {
    const software = this.getSoftware(name);
    if (!software)
      throw new Error(`software info not found: ${artifactNameToString(name)}`);
    return software;
  }

  addTemplate(tpl: Template) {
    const tplFromMap = this.templates.add(tpl.compileMode, tpl, false);
    if (tplFromMap)
      throw new Error(
        `compiler already contain such template: adding = ${fullNameToString(tpl.fullName)}, contains = ${fullNameToString(tplFromMap.fullName)}`
      );
  }

  allTemplates(): Template[] {
    return this.templates.array(this.compileMode)
  }

  getTemplate(name: TypedArtifactName): Template | undefined {
    if (name.type !== 'template')
      throw new Error(`illegal artifact type: got ${name.type} instead of 'template`);
    return this.templates.get(this.compileMode, name);
  }

  getTemplateOrError(name: TypedArtifactName): Template {
    const tpl = this.getTemplate(name);
    if (!tpl)
      throw new Error(`template not found: ${artifactNameToString(name)}`);
    return tpl;
  }

  getArtefact(name: TypedArtifactName): ArtifactSource | Template | undefined {
    switch (name.type) {
      case 'template':
        return this.getTemplate(name);
      case 'library':
        return this.getLib(name);
      case 'software':
        return this.getSoftware(name);
      case 'test':
        // Tests are ignored by the complier. They should never be compiled into templates or libs and
        // should never be a dependency.
        return undefined;
      default:
        assertNever(name.type);
    }
  }

  checkLibs() {
    this.libs.forEach(this.compileMode, lib => {
      for (const dep of lib.dependencies) {
        if (dep.type === 'test')
          throw new Error(`test should never be dependency of production code: ${typedArtifactNameToString(dep)} test is dependency of ${fullNameToString(lib.fullName)}`);

        if (!this.getArtefact(dep))
          throw new Error(`unresolved dependency ${typedArtifactNameToString(dep)} for ${fullNameToString(lib.fullName)}`);
      }
    });
  }

  compileAndAdd(sources: ArtifactSource[]): TemplatesAndLibs {
    const ret: TemplatesAndLibs = { templates: [], libs: [], software: [] };
    let current: ArtifactSource[] = [];

    for (const src of sources) {
      if (src.fullName.type === 'library') {
        // add libraries 'as-is' to be able to resolve them as dependencies
        this.addLib(src);
        ret.libs.push(src);
      } else if (src.fullName.type === 'software') {
        // add software 'as-is' to be able to resolve them as dependencies
        this.addSoftware(src);
        ret.software.push(src);
      } else {
        current.push(src)
      }
    }

    while (current.length > 0) {
      const unprocessed: { src: ArtifactSource, err: Error }[] = [];

      for (const src of current) {
        //
        // If one of the dependencies can't be resolved with current compiler context,
        // we put aside the source until next iteration, in hope that the dependency
        // will be satisfied then.
        //
        // This is equivalent to topological sorting of input sources.
        //
        const unsatisfied = src.dependencies.filter(dep =>
          !this.getArtefact(dep) &&
          // allow self reference for templates
          !(src.fullName.type === 'template' && typedArtifactNamesEquals(src.fullName, dep))
        )
        if (unsatisfied.length > 0) {
          let errorMessage = `Unsatisfied dependencies in ${fullNameToString(src.fullName)}:\n`
          for (const dep of unsatisfied) {
            errorMessage += `  - ${typedArtifactNameToString(dep)}\n`;
          }
          unprocessed.push({ src, err: Error(errorMessage) })

          continue;
        }

        // type specific processing
        switch (src.fullName.type) {
          case 'library':
            // libraries are added as is
            this.addLib(src);
            ret.libs.push(src);
            break;
          case 'software':
            // software dependencies are added as is
            this.addSoftware(src);
            ret.software.push(src);
            break;
          case 'template':
            // templates are compiled and then added
            try {
              const tpl = this.compileAndAddTemplate(src);
              ret.templates.push(tpl);
            } catch (err: any) {
              let errorMessage = `Unsatisfied dependencies in ${fullNameToString(src.fullName)}:\n`
              errorMessage += `  - ${err.message}\n`;

              unprocessed.push({ src, err: Error(errorMessage) }) // one or more dependencies are not resolvable yet
            }
            break;
          case 'test':
            // Ignore tests: they never should be part of compiled code or be a dependency.
            break;
          default:
            assertNever(src.fullName.type);
        }
      }

      // checking that we successfully added at least one source,
      // if not all the source files in unprocessed array have unmet dependencies
      if (current.length === unprocessed.length) {
        let errorMessage = '';

        for (const u of unprocessed) {
          errorMessage += `\n${u.err.message}`
        }
        throw new Error(errorMessage);
      }

      current = unprocessed.map(({ src: ArtifactSource }) => ArtifactSource);
    }

    return ret;
  }
}
