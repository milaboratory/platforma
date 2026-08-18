import type { Branded } from "@milaboratories/helpers";
import { splitVersionedName } from "../bmodel/block_kind_ref";
import type { BlockKindSelectorReference } from "./kind_selector";
import { parseKindSelector, parseKindSelectorReference } from "./kind_selector";

/**
 * Value of a template file's `schema` field — the format marker every
 * `template-v1` document opens with.
 */
export const PROJECT_TEMPLATE_SCHEMA_V1 = "template-v1";
export type ProjectTemplateSchemaV1 = typeof PROJECT_TEMPLATE_SCHEMA_V1;

/**
 * On-wire reference to one exact block package version, `{name}@X.Y.Z`.
 *
 * The `block` override's value type. Exact only — the override exists to pin an
 * implementation, so a range would defeat it. Mapping this to the structured
 * `BlockPackId` (`{ organization, name, version }`) is import-side work; the
 * organization lives inside the npm scope here, as it does for kind names.
 */
export type BlockPackReference = Branded<string, "BlockPackReference">;

/**
 * Split a {@link BlockPackReference} into `{ name, version }`.
 *
 * @throws if the reference carries no version segment or the version is not
 *   exactly `X.Y.Z`
 */
export function parseBlockPackReference(ref: BlockPackReference): {
  name: string;
  version: string;
} {
  const { name, version } = splitVersionedName(ref, "block package reference", "{name}@X.Y.Z");
  const selector = parseKindSelector(version);
  if (selector.op !== "exact") {
    throw new Error(
      `A 'block' override must pin an exact version (expected '{name}@X.Y.Z'): ${ref}`,
    );
  }
  return { name, version: selector.version };
}

/**
 * On-wire locator naming WHERE one entry's block implementation comes from, as an
 * absolute URI: `file:///abs/path/to/block`.
 *
 * The third way an entry can reach an implementation, and the only one that names a
 * place rather than a name. It exists for a block that is built but not published —
 * the implementation lives in a folder and no registry knows it, so neither `kind`
 * resolution nor a `block` version pin can find it.
 *
 * A URI rather than a bare path because the question "where" is not limited to the
 * filesystem, and because scheme dispatch is how the rest of the toolchain already
 * answers it. Which schemes an environment can actually serve is that environment's
 * business: this type fixes only the grammar, so a document remains readable by a
 * consumer that cannot fetch every scheme.
 */
export type BlockPackLocationReference = Branded<string, "BlockPackLocationReference">;

/**
 * Read the scheme off a {@link BlockPackLocationReference}, which is all the
 * document layer knows about it — resolving the rest belongs to whoever can reach
 * the scheme.
 *
 * A scheme is required. Accepting a bare path would mean reading it relative to
 * whatever directory the application happens to have been started from, which is
 * exactly the ambiguity a locator exists to remove.
 *
 * @throws if the value carries no scheme
 */
export function parseBlockPackLocation(ref: BlockPackLocationReference): { scheme: string } {
  const match = LocationSchemePattern.exec(ref);
  if (!match) {
    throw new Error(
      `A 'location' must be an absolute URI with a scheme (expected e.g. ` +
        `'file:///path/to/block'), got: ${ref}`,
    );
  }
  return { scheme: match.groups!.scheme.toLowerCase() };
}

/**
 * Scheme grammar, with one deliberate narrowing: a scheme is at least TWO
 * characters, while the URI grammar allows one.
 *
 * `C:\blocks\my-block` is a valid single-letter-scheme URI, so a Windows path
 * pasted into the field would otherwise be accepted with scheme `c` and then fail
 * far away from the mistake. Rejecting it here means the error names the actual
 * problem, and the fix — `file:///C:/blocks/my-block` — is spelled out.
 */
const LocationSchemePattern = /^(?<scheme>[A-Za-z][A-Za-z0-9+.-]+):/;

/**
 * One block in a template file.
 *
 * `kind` is always required: it carries the params contract the entry is typed against, and
 * whichever of the three routes finds the block, what that block declares is checked against
 * it — so params written for one contract cannot reach an implementation of another.
 *
 * A file may omit `params`, which is terseness and not an escape from the contract: the parser
 * reads the omission as `{}`, so an entry that leaves it out still fails for a kind whose
 * contract has required fields. Past the parser there is only one spelling, and no reader has
 * to normalize. There is no `label` field: a template
 * does not name block instances for display.
 *
 * An entry may also carry one locator override — see {@link BlockPackLocatorOverride} for
 * what each answers. Either one is resolved on its own and kind resolution is skipped
 * entirely; carrying both would state two different things with no way to reconcile them, so
 * the type admits at most one.
 */
export type ProjectTemplateV1Entry = {
  /**
   * Template-local identifier, unique within the file. Names the entry for
   * inter-block references; on export it is the block's project-local UUID,
   * reused verbatim.
   */
  readonly id: string;
  readonly kind: BlockKindSelectorReference;
  /**
   * The block's `BlockParams` instance, exactly as the block projected it — opaque here
   * and typed by the kind. Always present: an entry whose file omitted it parses as `{}`.
   *
   * The document layer looks inside for one thing only: a `{ $ref: … }` wrapper, which the
   * block puts around any value carrying block ids. Everything else travels verbatim,
   * references included, because an engine that parsed identifiers would have to model the
   * whole reference system to do it.
   */
  readonly params: Record<string, unknown>;
} & BlockPackLocatorOverride;

/**
 * The locator override an entry may carry: a version pin, a place, or neither.
 *
 * Two arms rather than two optional fields, so "not both" is a property of the type and not
 * only of the parser. Each arm forbids the other's field by typing it `never`, which is what
 * makes `{ block, location }` match neither — and both arms leave their own field optional, so
 * an entry that pins nothing satisfies either.
 *
 * Readers are unaffected: every arm declares both keys, so `entry.block` and `entry.location`
 * stay directly readable without narrowing.
 */
export type BlockPackLocatorOverride =
  | {
      /**
       * WHICH VERSION to install, leaving it to the environment to decide which registry
       * serves it — so an entry pinned this way stays portable.
       *
       * Exact only, `{name}@X.Y.Z` (see {@link BlockPackReference}): the override exists to
       * pin one implementation, and a range would defeat that. Export never writes it, because
       * it already records the exact version the block implements, leaving a pin nothing to
       * add — so this is a hand-written field.
       */
      readonly block?: BlockPackReference;
      /** Excluded: this arm is the version pin. */
      readonly location?: never;
    }
  | {
      /** Excluded: this arm is the place. */
      readonly block?: never;
      /**
       * WHICH PLACE to install from, as an absolute URI (see
       * {@link BlockPackLocationReference}).
       *
       * Names a concrete, possibly unpublished implementation, and is therefore only
       * meaningful where that place exists: a `file:` locator written on one machine says
       * nothing on another. That is the trade it makes — it is the only answer for a block
       * that is built but not published, which no registry can find and no kind can resolve
       * to. Export writes it for every block installed from the filesystem, since omitting it
       * would describe a project that cannot be recreated at all.
       */
      readonly location?: BlockPackLocationReference;
    };

/**
 * A `template-v1` document — the primitive form of a template.
 *
 * `blocks` order is the instantiation order, so every entry must appear after
 * the entries it references. This type is the shared contract for both
 * directions of the round trip: export emits exactly this, import parses
 * exactly this.
 *
 * Scope note: this package owns the *document*, i.e. the shape of the value a
 * YAML (or JSON) reader hands back. The text layer stays out on purpose —
 * pl-model-common is in every block-model and UI bundle and takes no `yaml`
 * dependency; serializing to YAML bytes belongs with the caller that already
 * has one (pl-middle-layer).
 */
export type ProjectTemplateV1 = {
  readonly schema: ProjectTemplateSchemaV1;
  readonly blocks: readonly ProjectTemplateV1Entry[];
};

//
// Reading a decoded document.
//
// Hand-written rather than schema-driven, for what a reader of a hand-written file gets out
// of it. A template is a file a person edits, so the parser's output is a bug report: every
// problem at once, each located the way the file is written, worded as the edit to make. That
// means owning the wording, which a schema library gives away — and the values here need
// checks a schema cannot express anyway (the reference grammars are functions, and the locator
// exclusion is a rule about two fields), so the schema was carrying the trivial half while the
// interesting half sat in refinements beside it.
//

/** One thing wrong with a document, and where in it. */
export type TemplateParseIssue = {
  /** Location in the decoded value: `["blocks", 2, "kind"]`. */
  readonly path: readonly (string | number)[];
  /** What is wrong, worded for whoever is editing the file. */
  readonly message: string;
};

/**
 * One issue as a line: `blocks[2].kind: Expected a kind reference, got nothing.`
 *
 * Indexes read as they are written in the file — `blocks[2]`, not `blocks.2` — so the place
 * can be found by reading rather than by counting.
 */
export function formatTemplateParseIssue(issue: TemplateParseIssue): string {
  const path = issue.path.reduce<string>(
    (acc, segment) =>
      typeof segment === "number"
        ? `${acc}[${segment}]`
        : acc === ""
          ? segment
          : `${acc}.${segment}`,
    "",
  );
  return path === "" ? issue.message : `${path}: ${issue.message}`;
}

/**
 * Every problem a document has, thrown once so a caller fixes the file in one pass.
 *
 * The issues are in `message` as well as on `issues`, because a throw that escapes to a log is
 * read as its message and nothing else.
 */
export class ProjectTemplateV1ParseError extends Error {
  constructor(readonly issues: readonly TemplateParseIssue[]) {
    super(
      [
        `The template document could not be read (${issues.length} problem(s)):`,
        ...issues.map((issue) => `- ${formatTemplateParseIssue(issue)}`),
      ].join("\n"),
    );
    this.name = "ProjectTemplateV1ParseError";
  }
}

/** A document, or everything wrong with the value that was supposed to be one. */
export type ProjectTemplateV1ReadResult =
  | { readonly ok: true; readonly document: ProjectTemplateV1 }
  | { readonly ok: false; readonly issues: readonly TemplateParseIssue[] };

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Keys an entry may carry. Anything else is a mistake, not an extension point. */
const ENTRY_KEYS = ["id", "kind", "block", "location", "params"] as const;

/**
 * Read an already-decoded template document — the value a YAML or JSON reader returns.
 *
 * Checks the format marker, every entry's shape, the reference grammars and id uniqueness,
 * and settles an omitted `params` to `{}`. Unknown keys are refused rather than ignored: a
 * misspelled key that was silently dropped would apply a file that does not say what its
 * author meant.
 *
 * It does NOT check what an entry's params point at, and nothing downstream of it does
 * either. Which values in there carry block ids is knowable only to the block, in its own
 * bundle, where the params are relocated onto the project being built — so a reference to an
 * entry listed later, or to the entry holding it, is not refused here. It survives into the
 * applied project as a block whose references name nothing, which is how a reference to a
 * deleted block already behaves.
 *
 * Collects rather than stops: a file with three mistakes should take one pass to fix.
 */
export function readProjectTemplateV1(value: unknown): ProjectTemplateV1ReadResult {
  const issues: TemplateParseIssue[] = [];
  const fail = (path: readonly (string | number)[], message: string) =>
    issues.push({ path, message });

  if (!isMapping(value)) {
    return {
      ok: false,
      issues: [{ path: [], message: "A template must be a mapping with 'schema' and 'blocks'." }],
    };
  }

  for (const key of Object.keys(value)) {
    if (key !== "schema" && key !== "blocks") fail([], `Unrecognized key: '${key}'`);
  }

  if (value.schema !== PROJECT_TEMPLATE_SCHEMA_V1) {
    fail(
      ["schema"],
      `Expected '${PROJECT_TEMPLATE_SCHEMA_V1}', got ${describe(value.schema)}. This is the ` +
        `format marker every template opens with.`,
    );
  }

  if (!Array.isArray(value.blocks)) {
    fail(["blocks"], `Expected a list of entries, got ${describe(value.blocks)}.`);
    return { ok: false, issues };
  }

  const blocks: ProjectTemplateV1Entry[] = [];
  const seen = new Set<string>();

  value.blocks.forEach((raw, i) => {
    const entry = readEntry(raw, ["blocks", i], fail);
    if (entry === undefined) return;
    if (seen.has(entry.id)) fail(["blocks", i, "id"], `Duplicate template-local id: ${entry.id}`);
    seen.add(entry.id);
    blocks.push(entry);
  });

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, document: { schema: PROJECT_TEMPLATE_SCHEMA_V1, blocks } };
}

/**
 * One entry, or `undefined` when it is not even a mapping — in which case its own fields are
 * not reported on top, since a reader given "this entry is not a mapping" does not also need
 * to hear that its `id` is missing.
 */
function readEntry(
  raw: unknown,
  at: readonly (string | number)[],
  fail: (path: readonly (string | number)[], message: string) => void,
): ProjectTemplateV1Entry | undefined {
  if (!isMapping(raw)) {
    fail(at, `Expected an entry mapping, got ${describe(raw)}.`);
    return undefined;
  }

  for (const key of Object.keys(raw)) {
    if (!(ENTRY_KEYS as readonly string[]).includes(key)) {
      fail(at, `Unrecognized key: '${key}'`);
    }
  }

  let ok = true;

  if (typeof raw.id !== "string" || raw.id.length === 0) {
    fail([...at, "id"], `Expected a non-empty id, got ${describe(raw.id)}.`);
    ok = false;
  }

  if (typeof raw.kind !== "string") {
    fail([...at, "kind"], `Expected a kind reference, got ${describe(raw.kind)}.`);
    ok = false;
  } else {
    // The grammars are functions, and their messages already name the fix, so they are
    // reported as they come rather than restated.
    ok = check([...at, "kind"], () => parseKindSelectorReference(raw.kind as never), fail) && ok;
  }

  if (raw.block !== undefined) {
    if (typeof raw.block !== "string") {
      fail([...at, "block"], `Expected a block package reference, got ${describe(raw.block)}.`);
      ok = false;
    } else {
      ok = check([...at, "block"], () => parseBlockPackReference(raw.block as never), fail) && ok;
    }
  }

  if (raw.location !== undefined) {
    if (typeof raw.location !== "string") {
      fail([...at, "location"], `Expected a locator URI, got ${describe(raw.location)}.`);
      ok = false;
    } else {
      ok =
        check([...at, "location"], () => parseBlockPackLocation(raw.location as never), fail) && ok;
    }
  }

  if (raw.block !== undefined && raw.location !== undefined) {
    fail(
      [...at, "location"],
      `An entry cannot carry both 'block' and 'location': the first pins which version to ` +
        `install, the second pins where to install it from. Keep the one that is actually meant.`,
    );
    ok = false;
  }

  if (raw.params !== undefined && !isMapping(raw.params)) {
    fail([...at, "params"], `Expected a mapping of params, got ${describe(raw.params)}.`);
    ok = false;
  }

  if (!ok) return undefined;

  return {
    id: raw.id as string,
    kind: raw.kind as BlockKindSelectorReference,
    ...(raw.block !== undefined ? { block: raw.block as BlockPackReference } : {}),
    ...(raw.location !== undefined ? { location: raw.location as BlockPackLocationReference } : {}),
    // Omissible in the file, settled here: every reader downstream gets a mapping.
    params: (raw.params ?? {}) as Record<string, unknown>,
  } as ProjectTemplateV1Entry;
}

/** Run a grammar check, turning its throw into an issue at `path`. */
function check(
  path: readonly (string | number)[],
  grammar: () => unknown,
  fail: (path: readonly (string | number)[], message: string) => void,
): boolean {
  try {
    grammar();
    return true;
  } catch (e) {
    fail(path, e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** A value named the way an error message should name it, without printing its contents. */
function describe(value: unknown): string {
  if (value === undefined) return "nothing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "string") return `'${value}'`;
  if (typeof value === "object") return "a mapping";
  return String(value);
}

/**
 * {@link readProjectTemplateV1} for a caller that treats an unreadable document as
 * exceptional — export, which asserts on every run that what it wrote can be read back.
 *
 * @throws {ProjectTemplateV1ParseError} carrying every problem found
 */
export function parseProjectTemplateV1(value: unknown): ProjectTemplateV1 {
  const outcome = readProjectTemplateV1(value);
  if (!outcome.ok) throw new ProjectTemplateV1ParseError(outcome.issues);
  return outcome.document;
}
