// YAML parser + serialiser, comment-preserving via the `yaml` lib's
// Document API (CST-preserving). Wraps `parseDocument` + `Document.toString`.
// Helpers (`yamlGet`, `yamlSet`, `yamlHas`, `yamlDelete`) operate on the
// Document by jsonPath-style addresses, matching the JSON parser's API.
// Comments attached to map entries survive set/delete operations as long
// as the affected nodes are mutated in place (not reassigned wholesale).

import {
  Document,
  isMap,
  isPair,
  isSeq,
  parseDocument,
  YAMLMap,
  YAMLSeq,
  Scalar,
  Node,
} from "yaml";

export type YamlDocument = Document.Parsed;

/** Parse YAML into a CST-preserving Document. */
export function parseYaml(raw: string): YamlDocument {
  return parseDocument(raw);
}

/** Serialise back to string. Preserves comments + ordering of unchanged
 *  nodes per the `yaml` library's contract. */
export function stringifyYaml(doc: YamlDocument): string {
  return doc.toString();
}

function splitPath(jsonPath: string): string[] {
  if (jsonPath === "" || jsonPath === undefined) return [];
  return jsonPath.split(".");
}

/** Get the JS value at the given jsonPath in the document. */
export function yamlGet(doc: YamlDocument, jsonPath: string): unknown {
  const parts = splitPath(jsonPath);
  if (parts.length === 0) return doc.toJS();
  return doc.getIn(parts, false) as unknown;
}

export function yamlHas(doc: YamlDocument, jsonPath: string): boolean {
  const parts = splitPath(jsonPath);
  if (parts.length === 0) return true;
  return doc.hasIn(parts);
}

/** Set a value at jsonPath. Auto-creates intermediate maps. Existing
 *  comments on parent map entries are preserved by the yaml library. */
export function yamlSet(doc: YamlDocument, jsonPath: string, value: unknown): void {
  const parts = splitPath(jsonPath);
  if (parts.length === 0) {
    throw new Error("yamlSet: jsonPath must be non-empty");
  }
  doc.setIn(parts, value);
}

/** Delete a value at jsonPath. No-op if missing. */
export function yamlDelete(doc: YamlDocument, jsonPath: string): void {
  const parts = splitPath(jsonPath);
  if (parts.length === 0) {
    throw new Error("yamlDelete: jsonPath must be non-empty");
  }
  doc.deleteIn(parts);
}

/** Re-export selected `yaml` lib types for downstream content-rule builders. */
export { isMap, isPair, isSeq, YAMLMap, YAMLSeq, Scalar };
export type { Node };
