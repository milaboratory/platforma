import { gunzipSync, gzipSync } from 'node:zlib';
import canonicalize from 'canonicalize';

/*
  Package "@milaboratory/current-tengo-package".

  Structure:

  src/
    local-template.pl.tengo  <- this one will be compiled and put into ./dist/tengo/tpl/local-template.pl.pkg
    local-library.tengo      <- this one will be normalized and put into ./dist/tengo/lib/local-library.tengo
    main.tpl.tengo           <- this one will be compiled into ./dist/tengo/tpl/main.pl.pkg and published by external tool

  Code of "main.tpl.tengo":

  getTemplate("@milaboratory/some-tengo-template") // -> getTemplate("@milaboratory/some-tengo-template:main")
  getTemplate(":local-template") // -> getTemplate("@milaboratory/current-tengo-package:local-template")
  import("@milaboratory/some-tengo-library") // -> import("@milaboratory/some-tengo-library:main")
  import(":local-library") // -> import("@milaboratory/current-tengo-package:local-library")

 */

export type ArtifactType = 'library' | 'template'

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

export type ArtifactName = Pick<FullArtifactName, 'type' | 'pkg' | 'id'>;

export type PackageName = Pick<FullArtifactName, 'pkg' | 'version'>;

export type ArtifactId = Pick<FullArtifactName, 'pkg' | 'id'>;

export function artifactKey(name: ArtifactName): string {
  return `${name.type}||${name.pkg}||${name.id}`;
}

export function fullNameToString(name: FullArtifactName): string {
  return `${name.type}:${name.pkg}:${name.id}:${name.version}`;
}

export function nameToString(name: ArtifactName): string {
  return `${name.type}:${name.pkg}:${name.id}`;
}

export function artifactIdToString(id: ArtifactId): string {
  return `${id.pkg}:${id.id}`;
}

export function fullNameWithoutTypeToString(name: FullArtifactName): string {
  return `${name.pkg}:${name.id}:${name.version}`;
}

export function fullNameWithoutType(name: FullArtifactName): FullArtifactNameWithoutType {
  return { pkg: name.pkg, id: name.id, version: name.version };
}
