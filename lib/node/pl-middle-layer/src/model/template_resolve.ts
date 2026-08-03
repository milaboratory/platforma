import type {
  BlockKindSelectorReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import {
  parseBlockPackReference,
  parseKindSelectorReference,
} from "@milaboratories/pl-model-common";
import type { BlockPackId, BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import type { TemplateApplyProblem } from "./template_apply";

/**
 * Where a template entry's block comes from.
 *
 * Both of an entry's paths to an implementation go through this one interface, and
 * both come back as the same `BlockPackSpec` — the shape the existing add-block path
 * already consumes — plus the block's published title. That convergence is the point:
 * everything downstream of resolution treats a kind-resolved entry and a
 * version-pinned one identically.
 *
 * Registry knowledge sits deliberately on the far side of this interface. A template
 * file names no registry, so choosing which one (or ones) to consult is a property
 * of the environment applying the file, not of the file — and keeping it out here is
 * what lets resolution be tested with no registry at all.
 *
 * The title is required rather than optional for the same reason: an implementation
 * always has one to hand — a registry adapter reads it off the block's manifest, and
 * anything else names the blocks it serves — while a caller downstream has no source
 * for it at all, and the fallbacks it could invent are all wrong. See
 * {@link ResolvedEntry}'s `title`.
 */
export type BlockPackProvider = {
  /**
   * Find the block implementing a kind selector.
   *
   * @param kind The entry's `{name}@{selector}` reference
   * @param options `allowUnstable` widens the search from stable implementations to
   *   every published one, for the whole apply
   */
  byKind: (
    kind: BlockKindSelectorReference,
    options: { allowUnstable: boolean },
  ) => Promise<KindResolution>;

  /**
   * Find one exact block package version, named directly.
   *
   * This is the `block` override's path, and it bypasses kinds entirely — the
   * override exists precisely to pin an implementation that resolution would not
   * have chosen.
   */
  byExactVersion: (id: BlockPackId) => Promise<ExactResolution>;
};

/**
 * The outcome of resolving one kind selector.
 *
 * The three failure reasons are distinct because each has a different way out, and
 * a caller that collapsed them would leave the reader guessing which:
 *
 * - `no-matching-kind-version` — the selector matches no published version of the
 *   kind at all. The file, or the registry, is wrong.
 * - `no-implementation` — the kind version exists, but nothing implements it. The
 *   kind was published ahead of any block.
 * - `no-stable-implementation` — implementations exist but none is stable, and the
 *   apply did not allow unstable ones. This is the only reason the user can act on
 *   without editing anything.
 */
export type KindResolution =
  | { readonly ok: true; readonly spec: BlockPackSpec; readonly title: string }
  | {
      readonly ok: false;
      readonly reason:
        | "no-matching-kind-version"
        | "no-implementation"
        | "no-stable-implementation";
    };

/** The outcome of locating one exact block version. */
export type ExactResolution =
  | { readonly ok: true; readonly spec: BlockPackSpec; readonly title: string }
  | { readonly ok: false; readonly reason: "no-such-block-version" };

/** Where one entry's block will come from. */
export type ResolvedEntry = {
  /** The entry's template-local id. */
  readonly entryId: string;
  readonly spec: BlockPackSpec;
  /**
   * The block package's own title, as its author published it — `meta.title` for a
   * registry block.
   *
   * Carried here because resolution is the only stage that talks to a registry, and a
   * registry is the only thing that knows it. Nothing downstream can recover it: a
   * prepared block pack holds the model, the workflow and the frontend, none of which
   * names the block.
   *
   * It becomes the created block's label, which is what the user sees for any block
   * whose model derives no title of its own — `graph-maker`, `table` and seven other
   * shipped blocks. Deriving it from the entry instead is specifically wrong: an
   * exported template names its entries by the source project's block ids, so a
   * round-tripped project would show UUIDs in the sidebar.
   */
  readonly title: string;
  /** True when the entry pinned an exact version instead of resolving its kind. */
  readonly pinned: boolean;
};

/**
 * What resolution found for a whole document.
 *
 * `resolved` is in file order and holds only the entries that resolved, so
 * `problems.length > 0` means it is incomplete. A caller must not apply a partial
 * resolution: the point of resolving before construction is that nothing is created
 * until every entry has an implementation.
 */
export type TemplateResolveOutcome = {
  readonly resolved: readonly ResolvedEntry[];
  readonly problems: readonly TemplateApplyProblem[];
};

/**
 * Resolve every entry in a template document to a concrete block pack.
 *
 * The first stage of an apply, and the only one that touches the network. It runs
 * before the project exists, which is what makes "no block for this entry" a message
 * about a file rather than a half-built project — and it is also why the whole
 * construction API downstream can be synchronous.
 *
 * Every entry is attempted, and every failure collected: an unapplicable file should
 * take one pass to fix, not one pass per bad entry. The one exception is that a
 * problem short-circuits nothing, so `resolved` may be shorter than the document.
 *
 * @param document A parsed template document
 * @param provider Where blocks come from
 * @param options `allowUnstable` applies to the whole document, not per entry
 */
export async function resolveTemplateEntries(
  document: ProjectTemplateV1,
  provider: BlockPackProvider,
  options: { allowUnstable: boolean },
): Promise<TemplateResolveOutcome> {
  const resolved: ResolvedEntry[] = [];
  const problems: TemplateApplyProblem[] = [];

  // Sequential, not concurrent. Entries commonly share a kind, and a provider
  // caching its reads can only dedupe them if the second request happens after the
  // first has landed. A template holds a handful of entries, so there is nothing to
  // win by overlapping the reads.
  for (const entry of document.blocks) {
    const outcome = await resolveEntry(entry, provider, options);
    if (outcome.ok) resolved.push(outcome.entry);
    else problems.push(outcome.problem);
  }

  return { resolved, problems };
}

type EntryOutcome =
  | { ok: true; entry: ResolvedEntry }
  | { ok: false; problem: TemplateApplyProblem };

async function resolveEntry(
  entry: ProjectTemplateV1Entry,
  provider: BlockPackProvider,
  options: { allowUnstable: boolean },
): Promise<EntryOutcome> {
  const problem = (error: string): EntryOutcome => ({
    ok: false,
    problem: { entryId: entry.id, error },
  });

  if (entry.block !== undefined) {
    let id: BlockPackId;
    try {
      const { name, version } = parseBlockPackReference(entry.block);
      id = { ...parseBlockPackName(name), version };
    } catch (e) {
      // The document's parser already checked the `{name}@X.Y.Z` grammar, but not
      // that the name carries an organization, so this is reachable from a
      // hand-written file. Reported rather than thrown, so one malformed entry cannot
      // hide the state of the rest.
      return problem(`Pinned block version is not readable: ${messageOf(e)}`);
    }

    const outcome = await provider.byExactVersion(id);
    if (outcome.ok)
      return {
        ok: true,
        entry: { entryId: entry.id, spec: outcome.spec, title: outcome.title, pinned: true },
      };

    return problem(
      `Block '${id.organization}/${id.name}' version ${id.version} was not found. Correct ` +
        `the pinned version in this entry, or remove it so a version is chosen ` +
        `automatically.`,
    );
  }

  let kindName: string;
  try {
    kindName = parseKindSelectorReference(entry.kind).name;
  } catch (e) {
    return problem(`Block kind is not readable: ${messageOf(e)}`);
  }

  const outcome = await provider.byKind(entry.kind, options);
  if (outcome.ok)
    return {
      ok: true,
      entry: { entryId: entry.id, spec: outcome.spec, title: outcome.title, pinned: false },
    };

  switch (outcome.reason) {
    case "no-matching-kind-version":
      return problem(
        `No published version of '${kindName}' matches what this entry asks for ` +
          `(${entry.kind}). Check the version, or update the block registry.`,
      );
    case "no-implementation":
      return problem(
        `'${kindName}' has no block implementing the version this entry asks for ` +
          `(${entry.kind}). Nothing can be installed for it yet.`,
      );
    case "no-stable-implementation":
      // The one failure with a way out that changes nothing in the file, so the
      // message names it.
      return problem(
        `The only blocks implementing '${kindName}' for this entry (${entry.kind}) are ` +
          `pre-release versions. Import again with unstable versions allowed to use them.`,
      );
  }
}

/**
 * Split a block package's npm name into the organization and name a registry knows
 * it by: `@npm-scope/organization.name` → `{ organization, name }`.
 *
 * The npm scope and the organization are different things, and only the second one
 * reaches the registry — `@milaboratories/milaboratories.test-download-file` is
 * published as organization `milaboratories`, name `test-download-file`. The split is
 * on the FIRST dot, so a name may contain further dots.
 *
 * Kind names follow the same convention, which is why a template can carry both in
 * the same npm-ish form.
 *
 * @throws if the name has no npm scope or no organization segment
 */
export function parseBlockPackName(npmName: string): { organization: string; name: string } {
  const slash = npmName.indexOf("/");
  if (!npmName.startsWith("@") || slash < 0) {
    throw new Error(`expected '@npm-scope/organization.name', got '${npmName}'`);
  }

  const base = npmName.slice(slash + 1);
  const dot = base.indexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    throw new Error(
      `'${base}' does not separate an organization from a name with '.' in '${npmName}'`,
    );
  }

  return { organization: base.slice(0, dot), name: base.slice(dot + 1) };
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
