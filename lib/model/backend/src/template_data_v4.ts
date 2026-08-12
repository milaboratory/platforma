import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

import type { BackendCapability } from "./capabilities";
import type {
  TemplateAssetDataV3,
  TemplateLibDataV3,
  TemplateSoftwareDataV3,
  TemplateWasmDataV3,
} from "./template_data_v3";

/**
 * A single template node.
 *
 * Identical to {@link TemplateDataV3} except for `templates`, which holds
 * hash references instead of nested nodes. That one field is the whole
 * difference between the two formats: v3 stores the template graph as a
 * tree, so a sub-template shared by N parents is serialised N times, once
 * per path that reaches it. Sharing is common and the graph is deep, so the
 * expansion is multiplicative rather than additive.
 */
export interface TemplateNodeV4 {
  /** i.e. @milaboratory/some-package:template */
  name: string;
  /** i.e. 1.2.3 */
  version: string;
  /** Hash of the source, resolved through CompiledTemplateV4.hashToSource. */
  sourceHash: string;

  /**
   * Custom hash token of the template for deduplication purposes. Can be set with 'hash_override' compiler option.
   * Dangerous! Remember: great power comes with great responsibility.
   */
  hashOverride?: string;

  libs: Record<string, TemplateLibDataV3>;
  software: Record<string, TemplateSoftwareDataV3>;
  assets: Record<string, TemplateAssetDataV3>;
  wasm?: Record<string, TemplateWasmDataV3>;

  /**
   * i.e. @milaboratory/some-package:some-template -> key into
   * {@link CompiledTemplateV4.hashToTemplate}.
   */
  templates: Record<string, string>;

  /**
   * Backend capability tokens this template (and its transitively-imported
   * sub-templates) requires to run. Populated by `tengo-builder` at compile
   * time and unioned upward, so the root node carries the full set. Same
   * vocabulary the backend advertises in
   * `MaintenanceAPI.Ping.Response.capabilities` — see `./capabilities.ts`.
   */
  requiredCapabilities?: BackendCapability[];
}

export interface CompiledTemplateV4 {
  /** Discriminator for future use */
  type: "pl.tengo-template.v4";

  /** Hashes of all artifact sources to the sources themselves. */
  hashToSource: Record<string, string>;

  /**
   * Content hash to template node, for every node in the graph. Sharing is
   * preserved: a node reached by many parents is stored once.
   */
  hashToTemplate: Record<string, TemplateNodeV4>;

  /** Key into {@link hashToTemplate} for the root node. */
  template: string;
}

/**
 * Content hash of a finished node, and the key it is stored under in
 * `hashToTemplate`.
 *
 * The node's `templates` values are already hashes of its children, so this
 * covers the whole subtree. Two nodes collide exactly when their subtrees are
 * identical, which is the sharing we want to keep.
 *
 * Keyed on content rather than on `sourceHash` because `hashOverride` exists
 * to give two templates with the same source distinct identities.
 */
export function templateNodeHash(node: TemplateNodeV4): string {
  const canonical = canonicalize(node);
  if (canonical === undefined) throw new Error("template node is not serializable");
  return createHash("sha256").update(canonical).digest("hex");
}

/** Root node of a compiled pack. Throws when the pack is internally inconsistent. */
export function rootTemplate(pack: CompiledTemplateV4): TemplateNodeV4 {
  return resolveTemplate(pack, pack.template);
}

/** Follows one `templates` reference. Throws when the pack is internally inconsistent. */
export function resolveTemplate(pack: CompiledTemplateV4, hash: string): TemplateNodeV4 {
  const node = pack.hashToTemplate[hash];
  if (node === undefined) {
    throw new Error(`malformed template pack: no template node for hash ${hash}`);
  }
  return node;
}

/**
 * Raised when a pack's `templates` references form a cycle.
 *
 * The compiler cannot produce one: a node's hash covers its children's
 * hashes, so closing a cycle would need a hash preimage. Only a corrupt or
 * hand-edited pack can contain one, and readers walk the graph recursively —
 * so detect it and say so, rather than overflowing the stack.
 *
 * v3 could not represent this at all: it nested children inline, so a cycle
 * would have been an infinite document.
 */
export function templateCycleError(node: TemplateNodeV4): Error {
  return new Error(
    `malformed template pack: template reference cycle through ${node.name}@${node.version}`,
  );
}
