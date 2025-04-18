/*
  Package "@milaboratory/current-tengo-package".

  Structure:

  src/
    local-template.pl.tengo  <- this one will be compiled and put into ./dist/tengo/tpl/local-template.pl.pkg
    local-library.tengo      <- this one will be normalized and put into ./dist/tengo/lib/local-library.tengo
    main.tpl.tengo           <- this one will be compiled into ./dist/tengo/tpl/main.pl.pkg and published by external tool

  Code of "main.tpl.tengo":

  plapi := import("plapi")

  plapi.getTemplateId("@milaboratory/some-tengo-template") // -> getTemplateId("@milaboratory/some-tengo-template:main")
  import("@milaboratory/some-tengo-library") // -> import("@milaboratory/some-tengo-library:main")

 */

export type CompileMode = 'dist';

export type CompilerOption = {
  /** Option name, like 'hash_override' */
  name: string; // we can't use strict literals typing here as we will break compatibility of the code through the lifetime of the compiler.

  /** Arguments of the option. Everything that follows option name */
  args: string[];
};

export type ArtifactType = 'library' | 'template' | 'test' | 'software' | 'asset';

/** Artifact Name including package version */
export interface FullArtifactName {
  /** Dependency type */
  type: ArtifactType;

  /** Fully qualified package */
  pkg: string;

  /** Id of the artifact inside the package */
  id: string;

  /** Package version */
  version: string;
}

export type FullArtifactNameWithoutType = Omit<FullArtifactName, 'type'>;

export type TypedArtifactName = Pick<FullArtifactName, 'type' | 'pkg' | 'id'>;

export type PackageName = Pick<FullArtifactName, 'pkg' | 'version'>;

export type ArtifactName = Pick<FullArtifactName, 'pkg' | 'id'>;

export function artifactKey(name: TypedArtifactName): string {
  return `${name.type}||${name.pkg}||${name.id}`;
}

export function fullNameToString(name: FullArtifactName): string {
  return `${name.type}:${name.pkg}:${name.id}:${name.version}`;
}

/** used for exceptions */
export function typedArtifactNameToString(name: TypedArtifactName): string {
  return `${name.type}:${name.pkg}:${name.id}`;
}

export function typedArtifactNamesEquals(
  name1: TypedArtifactName,
  name2: TypedArtifactName,
): boolean {
  return name1.type == name2.type && name1.pkg == name2.pkg && name1.id == name2.id;
}

export function fullNameEquals(
  name1: FullArtifactName,
  name2: FullArtifactName,
): boolean {
  return name1.type == name2.type && name1.pkg == name2.pkg && name1.id == name2.id && name1.version == name2.version;
}

/** used to format artefact name while generating output files */
export function artifactNameToString(name: ArtifactName): string {
  return `${name.pkg}:${name.id}`;
}

/** used to format artefact name and version while generating output files */
export function formatArtefactNameAndVersion(name: FullArtifactName): {
  name: string;
  version: string;
} {
  return { name: artifactNameToString(name), version: name.version };
}

/** used to format artefact name and version while generating output files */
export function parseArtefactNameAndVersion(nameAndVersion: {
  name: string;
  version: string;
}): FullArtifactNameWithoutType {
  const match = nameAndVersion.name.match(/^(?<pkg>[^:]*):(?<id>[^:]*)$/);
  if (!match) throw new Error(`malformed artifact name: ${nameAndVersion.name}`);
  return { pkg: match.groups!['pkg'], id: match.groups!['id'], version: nameAndVersion.version };
}

export function fullNameWithoutTypeToString(name: FullArtifactNameWithoutType): string {
  return `${name.pkg}:${name.id}:${name.version}`;
}

export function fullNameWithoutType(name: FullArtifactName): FullArtifactNameWithoutType {
  return { pkg: name.pkg, id: name.id, version: name.version };
}
