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

export type ArtefactType = 'library' | 'template'

/** Artefact ID including package version */
export interface FullArtefactId {
  /** Dependency type */
  type: ArtefactType;

  /** Fully qualified package */
  pkg: string;

  /** Name (path) of the artefact inside the package */
  name: string;

  /** Package version */
  version: string;
}

export type FullArtefactIdWithoutType = Omit<FullArtefactId, 'type'>;

export type ArtefactId = Pick<FullArtefactId, 'type' | 'pkg' | 'name'>;

export type PackageId = Pick<FullArtefactId, 'pkg' | 'version'>;

export type PkgAndName = Pick<FullArtefactId, 'pkg' | 'name'>;

export function artefactKey(id: ArtefactId): string {
  return `${id.type}||${id.pkg}||${id.name}`;
}

export function fullIdToString(id: FullArtefactId): string {
  return `${id.type}:${id.pkg}:${id.name}:${id.version}`;
}

export function idToString(id: ArtefactId): string {
  return `${id.type}:${id.pkg}:${id.name}`;
}

export function pkgAndNameToString(id: PkgAndName): string {
  return `${id.pkg}:${id.name}`;
}

export function fullIdWithoutTypeToString(id: FullArtefactId): string {
  return `${id.pkg}:${id.name}:${id.version}`;
}

export function fullIdWithoutType(id: FullArtefactId): FullArtefactIdWithoutType {
  return { pkg: id.pkg, name: id.name, version: id.version };
}
