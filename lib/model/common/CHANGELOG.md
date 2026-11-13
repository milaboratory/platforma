# @milaboratories/pl-model-common

## 1.56.0

### Minor Changes

- 92cf16f: New `ColumnsCollection.discoverRoots`: find the columns the given ones hang off

  `discover` starts from anchors and walks linkers down to what they contain (anchored on `sample`, it reaches `cell`). There was no way to go the other way, from `cell` to the `sample`-level columns above it. `discoverRoots` takes the columns you have and returns the roots they hang off:

  ```ts
  const found = collection.discoverRoots({
    leaves: [cellRef],
    mode: "enrichment",
    maxHops: 4,
  });
  // found: Array<{ root: ColumnRecipe; leaf: ColumnRecipe; path: ColumnRecipe[] }>
  ```

  Each entry is exactly what `discover({ anchors: { r: root } })` would return for the leaf: `leaf` is the requested column as a discovered column carrying the linker path and qualifications, so the table is built from `root` as the anchor plus `leaf`, the same way as for any discovered column. `discover` is unchanged.

  The engine side is the new `discoverRoots` request of the spec frame (`PFrameSpecDriver.discoverRoots`), from milaboratory/pframes-rs#295.

## 1.55.2

### Patch Changes

- 9aea514: `Project.watchBlockStatus()` folds a block's action-context tree into a live `BlockStatusSummary`, with the run's jobs counted per state as the backend reports it, one computable per context so a report re-reads only its own context, and the project tree prunes the action-context fields. `PlTreeNodeAccessor` gains `listKeyValuesAsString(prefix)` and `listFields()`.

## 1.55.1

### Patch Changes

- b278e85: Build on windows, iter 1. Technical release
- Updated dependencies [b278e85]
  - @milaboratories/pl-error-like@1.12.11
  - @milaboratories/helpers@1.14.7

## 1.55.0

### Minor Changes

- 9901322: Args issues: `BlockModelV3.argsIssues(({ args, data }) => ArgsIssue[])` finds what keeps a block from running, so `args()` can build args even from incomplete data instead of throwing. It is set after `.args()` and throws when called before it; setting `.args()` again drops it. It is called after `args()`, with its result and the block data.
  `BlockModelV3.prerunArgsIssues(({ prerunArgs, data }) => ArgsIssue[])` does the same for staging. It is set after `.prerunArgs()` and throws when called before it, `.args()` alone included; setting `.prerunArgs()` again drops it. It is called after `prerunArgs()`, with its result and the block data, and not when `prerunArgs()` returned `undefined`, which skips staging as before. `prerunArgs` is typed by what `.prerunArgs()` returns: `.prerunArgs()` is now generic in its return type, and `BlockModelV3` has a trailing `PrerunArgs` type parameter, `unknown` by default.
  `ArgsIssue` is `{ severity: "error" | "warning"; message: string }`, in `@milaboratories/pl-model-common` with `parseArgsIssue` and `parseArgsIssues` for values of unknown origin; any severity other than `"warning"` is read as an error. An error of `argsIssues` blocks Run, an error of `prerunArgsIssues` skips staging; a warning does neither. A throw from either, or a result that is not a list of issues, counts as one error carrying the thrown or parser message. A throw from `args()` or `prerunArgs()` keeps its meaning: no args, no staging.
  The `__pl_args_derive` callback returns `{ value: args, issues }` when nothing blocks the run, `issues` being the warnings; `{ error, args, issues }` when `argsIssues` found errors, `error` joining their messages with "; "; and `{ error }`, as before, when `args()` threw.
  The `__pl_prerunArgs_derive` callback returns `{ value: prerunArgs, issues }` to stage, `issues` being the warnings; `{ error, issues }` when errors were found, `error` joining their messages; and `{ error }`, as before, when the lambda building the prerun args threw. A block with its own `.prerunArgs()` is checked by its `prerunArgsIssues`, and its `argsIssues` is not consulted. A block without its own `.prerunArgs()` is staged with its args only while its `argsIssues` finds no errors in them.
  A block without `argsIssues` and `prerunArgsIssues` derives the same args and prerun args as before; the results only carry an extra `issues: []`.
  The middle layer stores the block's args in `currentArgs` whenever `args()` produced them, and with every args it derives for a block with model API version 2, the errors `argsIssues` found in them in the block's `inputsValid` project field, as `{ argsFingerprint, errors }`: `errors` is the list of error issues, empty when the block may run, `argsFingerprint` the SHA-256 of the canonical JSON of the args they were found in. The field exists while the block has args, is rewritten only when its content changes, is duplicated with the block and deleted with it, and is deleted when a block pack update moves the block to model API version 1. A field that is missing, cannot be read, or whose fingerprint does not match the current args — a project saved before this middle layer, or args written by a middle layer that does not know the field — records no errors, so the block is runnable as before: such a middle layer refuses every block whose `argsIssues` could find errors, and the field is neither derived again nor rewritten on its account. A block with args errors is not runnable: its `inputsValid` in the project overview is false, so its Run is disabled, and rendering its production throws, as it does for a block without args. Its dependent blocks may not run while it needs to run itself; a block whose results are up to date keeps feeding them. Other blocks keep the earlier rule: a block that is not valid — one with model API version 1 whose `inputsValid` is false, or one whose code cannot run here — keeps every block below it from running. Errors of `prerunArgsIssues` are not stored: they leave the block without `currentPrerunArgs`, which skips its staging, as a failed derivation does.
  A block whose model has no `argsIssues`, or was built with an earlier SDK, behaves as before: args that `args()` returns are runnable, and a throw leaves it without args and not runnable; with model API version 2, its `inputsValid` field holds no errors. A middle layer that knows args issues reads the results of older models the same as before.
  The SDK sets the new `requiresArgsIssues` feature flag (`BlockCodeKnownFeatureFlags`) on every block it builds, as it does `requiresModelAPIVersion`. A block built with this SDK therefore requires an app whose middle layer supports args issues, which registers `requiresArgsIssues` among its runtime capabilities: an older desktop app refuses the block, since it would take incomplete args as runnable and run them.
  Older middle layers read only `error` and `value` of both derive results, so a block without the flag whose prerun args have errors is not staged there, as with a throwing `prerunArgs()`.
  Model outputs, sections, titles and other lambdas that read `ctx.args` now see the incomplete args of a block that uses `argsIssues`, where before they saw none.
- 8d28bcd: Column value references: `ColumnValueId` names one value of a column a block picked, and template relocation repoints the producer block inside it. The value is always a string: a value of a number column is its decimal string (`String(cell)`), so the same value picked from a number cell and from a text cell is the same id, and ids compare with `===`. `createColumnValueId` refuses a value that is not a string, and an id whose value is not a string is not a `ColumnValueId`.
  A value picker is made like a data table, in two halves. The model gives `createColumnValueOptions({ valueColumn, labelColumn? }, { ctx? })` as an output — each column an id, a column or a recipe — a frame holding the value column and the label column, `resolving` while either is, `absent` once the value column is gone (a gone label column leaves the values to label themselves), each with the value column it was made for. The UI reads it through the frame, so a column of any storage format can be picked from: `readColumnValueOptions(model)` gives the distinct non-missing values as `{ value: ColumnValueId, label }` options in natural order of labels, each labelled by the label column in its row or by itself (`deriveColumnValueOptions`, `deriveLabelledColumnValueOptions`). In Vue, as with a table, the output reaches the dropdown through settings: `usePlColumnValueSettings({ source, valueColumn })` makes them out of the output and the column picked now — `none`, `pending` until the output is computed for that pick, `absent`, or `present` — and `<PlColumnValueDropdown>` and `<PlColumnValueDropdownMulti>` take them as `settings`: `PlDropdown` and `PlDropdownMulti` over the values, loading until they are read and telling why a column offers none; `exclude` leaves out values, and other attributes and the slots go to the dropdown.
  `columnValueLabel(picked)` names a picked value to the user: the value a column value id picks, or the string as is when it is not such an id.
  In workflows, `workflow.column-value` reads such ids back into plain values, always strings: `valueOf` for one id, `valuesOf` for an array of them.
  The middle layer computes the column links of each block: `dependencies` — outputs of other blocks the block's args reference: its current args, else those of its last run — and `dependents` — blocks whose args reference the block's outputs. They reach the app and the block UI as `columnLinks` of the block state (`BlockStateInternalV3`, `BlockStateV3`): `BlockColumnLinks` with `blockId`, the block they are of, the two sides as lists of `ColumnLink` — the referenced block output (`producer`), the block holding the reference (`holderBlockId`), the column id, the picked values, the check and the column label — and `labels` of the other blocks they name; `undefined` while they are not computed, and in app versions that do not compute them. They are computed only for blocks whose model declares the `supportsColumnLinks` feature flag, which `BlockModelV3` sets, so blocks built with an earlier SDK add no work. Each block's links are computed on their own: its dependencies read its args and the last runs of the blocks they reference; its dependents read the args of every block below it — those of its last run for a block without current args — and its own last run. So a run of a block recomputes its dependents and the dependencies of the blocks that reference it — and, while it has no current args, the dependents of every block above it; an edit of a block's args recomputes its own dependencies and the dependents of every block above it, whether it references them or not. Each reference carries the picked values and a `LinkCheck`, read the same on both sides, checked against what the producer's last run exports: whether the column is exported and whether it holds the picked values. A reference to a block that has no last run is `notRun`: the block has to be run first. A reference to a block whose last run is still rendering its results is `pending`; one whose last run failed to render them is `unavailable`. A reference to an output its producer does not export is `unavailable`: among `dependents`, the dependent block cannot run against it. A reference to a block that is not above the block holding it is `unavailable` too. A column counts as exported once its spec is in the producer's last run; picked values are checked against those its `pl7.app/discreteValues` annotation lists, else against its data. A reference whose column values cannot be read is `unreadable`; one whose column lacks picked values is `missingValues`, with the values it lacks. Each reference carries the column's label: the exported column's, or, when the producer's last run does not export it, that of the column the producer prepares before it is run; the status is still judged by the last run alone. The middle layer labels the blocks by their titles, the names the project shows.
  `PlBlockDependencies` turns column links into the alerts shown above a block, one per side, for the links that need attention: an error when an output this block uses is unavailable or lacks picked values; a warning, noting that the links are checked against this block's last run, with advice to add the missing data and run the block or reconfigure those blocks, when blocks using this block's outputs use an output it does not export or pick values it lacks; a block that has not been run yet provides no output, so links to it raise these alerts as to an output that is not provided. Columns are named by their label; output names are shown only as hints. Outputs of one block that are not exported and have no known label share one alert line ("uses 2 outputs this block does not export"). Value pickers tell, from the same links, which block was to provide a missing column or column value and what went wrong, or, when its column is provided while other inputs of the block are not, that it waits for them: the options of one input may be made from another. `computeDependencies` and `computeDependents` are in `@milaboratories/pl-model-common`; turning links into alerts and picker tooltips stays inside `@platforma-sdk/ui-vue`.
  `PlBlockDependencies` (`<PlBlockDependencies />`) shows those alerts in a block UI that places it, from the column links the app provides, and nothing when it provides none; each other block is named by `PlBlockName`. The reader can fold the warning about blocks using this block's outputs to its title by clicking the title, which then counts the blocks ("2 blocks"); the fold is the reader's own, kept in the browser storage under the block id, and a folded warning is marked "Updated" once it says something else than when it was folded. The error about this block's own inputs does not fold. `PlAlert` takes a `label` slot in place of the `label` text, and leaves out the text area when given no text.
  `PlBlockName` (`<PlBlockName :block-id="id" :name="label" />`) shows the name of another block of the project: a link opening that block when the app can open blocks, and plain text otherwise.
  Block UIs can ask the app to open another block of the same project: `PlatformaV3` has an optional `openBlock(blockId)`, absent in app versions that cannot do it; in Vue, `useOpenBlock()` returns a function opening a block by id, or `undefined` when the app cannot.
  `PlDropdown` and `PlDropdownMulti` show a selected column value id by the value it picks: as is while the options load, and as "<value> — not available" when the options lack it, unless `missingValueLabel` is given.
  `PlValueLabel` (`<PlValueLabel :value="item" :options="options" />`) shows a selected value as text the way a dropdown does: by its option's label, a column value id by the value it picks, and a value the options lack as not available, in error color.
  `PlDropdown`, `PlDropdownMulti`, `PlDropdownRef`, `PlDropdownMultiRef` and `PlValueLabel` take `missingValueTooltip`, a tooltip explaining a selected value missing from the options, and `missingValueLabel`, the text shown in its place: each one text for every such value, or a function giving it — the tooltip content — per value, `undefined` when there is nothing to tell. The ones `@platforma-sdk/ui-vue` exports pass both themselves when the app provides column links, for a missing column — selected by id or by ref — and a missing column value: the tooltip names the block that was to provide the column, as a link to it, and what went wrong — it does not provide the column (a block that has not been run yet provides none), the column lacks the value, or the block is still computing it; when the column is provided while other inputs of the block are not, the tooltip says it waits for them. The value is shown by the picked value, or by the label of a column selected as a whole: alone while it waits, as "<name> — not available" otherwise.
  `PlDatasetSelector` explains a selected dataset or filter the options lack the same way, by the column it selects: the dataset first, then its filter.
  `PlDropdownRef` and `PlDropdownMultiRef` show a missing value as "Value not available", like the other dropdowns, instead of "Upstream value removed".
  Inside a `PlTooltip`, `--txt-link` is the tooltip link color, so links drawn with it — `PlBlockName` among them — read on the dark tooltip background like the tooltip's own links.

## 1.54.2

### Patch Changes

- 9cff344: `ColumnsCollection` holds columns only: its driver lists an id only once it has read a column spec for it, so it skips ids whose spec is not readable in the current render and exports that are not columns, such as the `kind: "File"` library of MiXCR Clonotyping. `AccessorColumnsProvider`, `ResultPoolColumnsProvider` and `buildDatasetOptions` skip them too. For such an export, `Column(id)`, `DataColumn.fromId`, `DataColumn.fromPlRef` and `DataColumn.fromAccessor` throw `ColumnAbsentError`; the status getters still report `present`, since status tells only whether the spec is readable. The driver ships with the desktop app; the rest reaches a block when it is rebuilt with this SDK. `ColumnsCollectionDriverHost.resolveSpec` now returns any `PObjectSpec`, and `ColumnsCollectionDriver.isEmpty` takes the host.

## 1.54.1

### Patch Changes

- Updated dependencies [4cc1e4e]
  - @milaboratories/helpers@1.14.6
  - @milaboratories/pl-error-like@1.12.10

## 1.54.0

### Minor Changes

- bb4e8d4: Mark columns reached through a peer link with a link icon. A peer link joins two datasets' main axes (the second axis of a `pl7.app/isAnchor` column), e.g. a clonotype to its nearest known antibody, so the columns behind it describe a different clonotype than the row. Hovering the icon shows "Reached via <link label>".

  - `PlColumnLabel` (uikit) takes an option (`{ label, linkHint }`) and draws the label with the link icon and its hover text. Every table and dropdown below uses it.
  - Tables: the header, Manage Columns and the table filter show the icon, and list peer-linked columns after the others. `PlDataTableColumnMeta.linkHint` carries the hover text, the same field dropdown options use. Same-named columns reached through different links, or one through a link and one directly, no longer get a "via" postfix; the icon and its hover text tell them apart.
  - Dropdowns: options take an optional `linkHint`, the hover text. `PlDropdown` shows it on the icon, and on the closed field's tooltip. `deriveColumnOptions` and the new `deriveRecipeOptions` set it and list peer-linked options last.
  - New helpers: `collectDatasetAxes`, `getResultPoolDatasetAxes`, `findPeerLinks`, `describePeerLinks`, `createPeerLinkFinder`, `peerLinkedLast`.

## 1.53.0

### Minor Changes

- de59755: A `template-v1` document may carry an optional `label` and `description`, each read trimmed and dropped when blank; `withTemplateMeta` sets or removes them. The middle layer's new `importTemplate` stores a template from a document under the label it is given, taking the document's description as the template's own.

## 1.52.0

### Minor Changes

- f4567dd: Finality is one table built in layers (`FinalityTable`): `StrictFinality` (the base: nothing
  observable changes after final, except the writes its entries name), `CacheFinality` (adds the
  types whose only later writes are KV; used by the transaction resource cache) and `TreeFinality`
  (adds `Blob` and `StreamManager` under the reader assumptions stated at their entries; the
  default `PlClient.finalPredicate`). A layer only adds to its parent.
  `DefaultFinalResourceDataPredicate` is deprecated and delegates to `TreeFinality`.
  Finality rules: `BResolveSingle`, `BResolveChoice` and `BlobCopy/*` are final once ready (or a
  duplicate, or errored) with outputs locked and every supplied field settled; `LSProvider` is
  never final; `Frontend/FromLocalTgz`, `json/bool`, `json/null` and `json/errorTrace` are always
  final. The project tree's stop rules are generated from `TreeFinality`, each entry declaring how
  it translates. `ResourceTypePrefix.BlobCopy` identifies blob-copy resource types.

## 1.51.0

### Minor Changes

- cadf144: Folders: projects and templates can be arranged in a tree

  **The document.** One user's folder tree is one JSON document at schema version 1: the folders,
  each with a name, an optional parent and an optional description, plus two maps — `assignments`
  from a project to the folder holding it, and `templateAssignments` from a template to its folder.
  An item neither map mentions is at the top level. The document lives in a `Folders` singleton of
  its own on the user's client root (`FoldersField`, `FoldersResourceType`), created by the middle
  layer's init; nothing is added to the projects resource. Every write mints a new immutable value
  and re-points the singleton's one field.

  **The healing read.** `decodeStoredFoldersDocument` turns what is stored into a `FoldersDecoded`.
  No document means no folders, and writable. A document written by a newer build, or one that
  cannot be read as schema version 1, reads as no folders with `writable: false` and a `problem`, so
  a build that does not understand a tree never overwrites it with its own truncated view.

  `healFolders` resolves the decoded document against the project and template lists into a
  `FoldersView`. The read heals and never fails: an item the document does not mention is at the
  top level, an assignment naming an item that is gone is ignored, and a folder whose parent is
  missing, or which sits in a cycle, is lifted to the top level and flagged `lifted`. No input can
  make a project or a template disappear. `validateFoldersDocument` is the write path's
  counterpart: a write that would persist a broken document — a cycle, a missing parent, a blank
  folder name, two items of one name in one parent — is refused.

  `MiddleLayer.folders` publishes a `FoldersListing`: the folders, every project
  (`FoldersProjectEntry`) and every template (`FoldersTemplateEntry`), each with its `folder`,
  `ancestors` and `path`. The folder tree, the project list and the template list are read in one
  computable, and nothing is published while any of them is still syncing, so an item is never
  shown at the top level first and then moved into its folder.

  **One namespace per parent.** Folders, projects and templates inside one parent share one
  namespace, and names are compared ignoring case and surrounding whitespace (`foldersNameTaken`).
  A name a person typed is refused when it is taken, with `"X" is already used here.`; a name the
  middle layer chose is suffixed instead — `X (Copy)`, `X (Copy 2)` (`foldersUniqueName`). Names
  already stored are never rewritten: a collision an account already holds is tolerated, and either
  side of it can still be renamed. While the folder document cannot be read, project and template
  renames are not checked, since treating every item as top-level would turn the per-parent rule
  into a global one.

  **Folder operations.** `MiddleLayer` gains `createFolder`, `renameFolder`,
  `setFolderDescription`, `previewFoldersMove`, `moveFolderItems`, `previewFolderDeletion`,
  `deleteFolder` and `duplicateFolder`. `createProject` and `createProjectFromTemplate` take the
  folder the new project lands in. A folder name is stored trimmed, and a blank one is refused.

  **Reset.** `MiddleLayer.resetFolders` replaces a folder document this build cannot read, newer or
  unreadable, with an empty one, leaving every project and template at the top level; it is refused
  while the document reads fine.

  **Move: preview, then confirm.** A move takes any mix of folders, projects and templates into one
  destination. `planFoldersMove` produces the plan the preview shows — every item and the name it
  ends up with, templates included — and `moveFolderItems` recomputes it inside the write
  transaction. `commitFoldersMove` commits only when the recomputed plan equals the confirmed one
  (`foldersMovePlansEqual`); otherwise nothing is written and the `FoldersMoveOutcome` is
  `plan-changed`, carrying the fresh plan to confirm again. A move that renames something needs a
  confirmed plan (`needs-confirmation`), and a move that cannot be planned reports `cannot-plan`
  with its `FoldersMoveIssue`s. A folder moves with everything inside it, and an item selected
  together with a folder that holds it travels with that folder.

  **Recursive delete, always confirmed.** Deleting a folder destroys it, every folder beneath it,
  and every project and template held anywhere in that subtree, in one transaction.
  `planFoldersRemoval` returns the `FoldersRemoval` naming exactly what goes. A deletion cannot be
  undone, so `deleteFolder` requires that removal back as `confirmedRemoval` however little it
  destroys, and `commitFoldersRemoval` refuses it as `plan-changed` when the subtree has changed
  since: a project dropped into the folder after the dialog opened aborts the deletion rather than
  being destroyed unseen.

  **No depth limit.** Folders nest to any depth. A cycle is refused by the write path and cut by
  the read.

  **Placement follows the source.** A duplicate of a project, and a template saved from one, land in
  the folder holding their source, placed in the transaction that creates them (`inheritedFolder`).
  `duplicateFolder` copies a whole subtree beside its source, under `X (Copy)`.

  **Descriptions.** Projects, templates and folders carry free text beside their name:
  `ProjectMeta.description`, `TemplateListEntry.description` (written by
  `MiddleLayer.setTemplateDescription`) and `FolderEntry.description` (written by
  `MiddleLayer.setFolderDescription`). A description is stored trimmed (`normalizeDescription`);
  blank clears it, and nothing is stored for a thing nobody described. A duplicate, a snapshot taken
  for a share and a copy taken out of one all carry the source's description.
  `saveProjectAsTemplate` takes the new template's description after its label; without one the
  template is stored undescribed.

  `TemplateId` moves to `@milaboratories/pl-model-common`, beside `ProjectId`, so the model package
  can name what it places. `@milaboratories/pl-middle-layer` still exports it. `asProjectId`,
  `asTemplateId` and `asFolderId` brand a string already known to be such an id, such as one a caller
  hands back.

  The template list skips, rather than throws on, an entry that is not a fully synced template, the
  way the project list does, so one such entry no longer takes the whole list down.

  **Visible changes to released API:**

  - `setProjectMeta` takes a patch (`Partial<ProjectMeta>`) and leaves the fields it is not given as
    they are, so a rename can no longer revert a description written in between.
  - `setProjectMeta` and `renameTemplate` throw when the new name is already used by something else
    in the same parent, compared ignoring case and surrounding whitespace: renaming a project to
    `SAMPLES` beside a `Samples` is refused, while the same name in two different folders is fine.
    The check runs in the rename's own transaction, so two renames racing for one name cannot both
    win.
  - `setProjectMeta`, `renameTemplate` and `saveProjectAsTemplate` store the name trimmed.
  - `saveProjectAsTemplate` without a label names the template to be free beside its source project
    (`X (Copy)` for a project `X`), and throws when a label it is given is already used there.
  - `duplicateProject` without `rename` names the copy beside its source, `X (Copy)`, where it used
    to reuse the source's label. A label returned by `rename` is kept as it is; when it is taken
    beside the source, the copy lands at the top level.
  - The "not found" errors read `Project X not found in the project list.` and
    `Template X not found in the template list.`

## 1.50.0

### Minor Changes

- 3716dcb: Graph aesthetic annotations: new `pl7.app/graph/shape` carries a default dot shape per column value (R shape codes). `pl7.app/graph/palette` gains `midPoint`, `min`, `max` and `log` for continuous columns, and its `mapping` is now optional so a continuous default needs no per-value entries. Both annotations are defaults a user can override in the interface.

## 1.49.0

### Minor Changes

- e8f26d6: Applying a template repoints the block ids held inside a domain.

  An axis a block produced names that block in its domain — `pl7.app/sampleId` carries the id of
  the block that defined the samples, a clonotype key the id of the run that called the clonotypes.
  Those are references, but `relocateBlockIds` skipped them: it rewrites what it recognizes as a
  column identifier, and a domain entry is neither. A block whose params named an axis therefore
  applied still pointing at the project it was exported from, and the chart or table bound to that
  axis came back empty.

  Which entries are repointed is decided by the key, against the new `BlockScopedDomain` set. A
  template's entry ids are only required to be non-empty strings, so a hand-written document names
  its entries readably — and a qualifier reading `closest` must not be taken for an entry called
  `closest` merely because both strings match. The failure modes are what make a list the right
  shape here: a key on it can only hold a block id, so listing one cannot corrupt anything, while a
  key left off is simply not relocated, which is the behaviour from before.

  Two things to know:

  - A domain inside an identifier this package recognizes is spec data and is left alone, as before.
    An overridden column's `specOverrides.domain` is reached by taking that id apart, never by the
    generic walk, so it does not move.
  - Only identifiers that travel as objects are reached. One flattened into a canonical string whose
    shape this package does not recognize — an anchored id, a `PTableColumnSpec` inside saved table
    state — stays opaque, exactly as it was. A block that wants an axis reference to survive a
    template has to hand it over taken apart.

  The set covers the `pl7.app/*` vocabulary. A block inventing a block-scoped domain of its own needs
  it added here, and until then a template carrying that domain applies still naming the project it
  came from.

## 1.48.0

### Minor Changes

- 80a9963: Block kinds and project templates.

  A **block kind** is a separately-versioned npm package declaring the typed init-params
  contract a block is created from; many block versions implement one kind version. On top
  of kinds sits the **template engine**: a project exports to `template-v1` YAML, and a
  template — exported or hand-authored — applies into a fresh project.

  **New package `@platforma-sdk/block-kind`.** `defineBlockKind<BlockParams>({ name,
version, parseInitializationParams })` returns a frozen `CompiledBlockKind`. Source `name` /
  `version` from the kind's own `package.json` so the on-wire `{name}@{version}` cannot
  drift from what npm publishes.

  ```ts
  // <block>/kind/src/index.ts
  import { defineBlockKind } from "@platforma-sdk/block-kind";
  import { name, version } from "../package.json" with { type: "json" };

  export type BlockParams = { numbers?: number[] };
  const Params = z.object({ numbers: z.array(z.number()).optional() }).strict();

  export const kind = defineBlockKind<BlockParams>({
    name,
    version,
    parseInitializationParams: (value) => Params.parse(value),
  });
  ```

  **`@platforma-sdk/model`** — the kind is now part of the model:

  ```ts
  const dataModel = new DataModelBuilder({ kind })
    .from<BlockDataV1>("v1")
    .init(({ params }) => ({ numbers: params?.numbers ?? [] }));

  export const platforma = BlockModelV3.create({ dataModel, kind })
    .templateParams((data) => ({ numbers: data.numbers }))
    .args(...)
    .done();
  ```

  `init` receives the kind's `params` (optional — a block may be created without a
  template) and builds the block's initial storage from them. `templateParams()` is the
  inverse: it projects block state back to the kind's params for export. Both are written in
  live terms — the SDK marks the column identifiers in what the lambda returned, so nothing about
  templates leaks into a block's own code.

  **`@milaboratories/pl-model-common`** — `BlockKindReference` + `formatKindRef`, the
  `template-v1` document schema, the kind selector's semver ranges, and the `{ $ref: … }` wrapper
  that marks a column identifier inside template params. `wrapTemplateRefs` puts those wrappers
  on, in the block's own bundle where the reference system is already known; the template engine
  stores what is inside verbatim and redirects the block ids textually, so it holds no model of
  that system at all.

  **`@milaboratories/pl-middle-layer`** — `MiddleLayer.exportProjectAsTemplate(id)` and
  `MiddleLayer.applyTemplateToProject(id, document)`, backing "Export Project as
  Template…" and "Create Project from Template…". The template import path is public:
  `parseProjectTemplateV1Yaml`, `validateTemplateV1ForApply`, `resolveTemplateEntries`, plus the
  `BlockPackProvider` seam deciding which registries to consult. Entries resolve against the configured registries, ids are mapped to the blocks
  they become, and each entry's params are offered to the block's kind for a shape check
  before anything is created.

  **`@platforma-sdk/block-tools`** — the `kind` part in `.structure` with its own package
  rules and scaffold, a `build-kind-manifest` command, kind-first publication (the kind
  content is written to the registry's `kinds/` tree, source-hash guarded and idempotent,
  before the facade — gated by a version-match check that hard-fails before any write),
  and registry-side kind resolution.

  **`@milaboratories/ts-builder`** — `block-kind` build target (rolldown config + tsconfig).

  **BREAKING:**

  - `BlockModelV3.create(dataModel)` → `BlockModelV3.create({ dataModel, kind })`. A block
    cannot omit its kind.
  - `new DataModelBuilder()` → `new DataModelBuilder({ kind })`, and `init` takes
    `({ params })` rather than no argument.
  - `templateParams()` is required — `done()` throws without it. A block whose state
    cannot be reduced to params returns `{}` explicitly, rather than exporting an entry
    that silently applies as a default-initialized block.
  - Every kind must declare `parseInitializationParams`. A kind whose params are genuinely empty
    still declares one; it just rejects everything but `{}`.
  - Publishing a block whose model was compiled against a kind requires the facade to
    declare that kind as a dependency, at a matching version. Blocks declaring no kind
    publish exactly as before.

### Patch Changes

- @milaboratories/pl-error-like@1.12.10
- @milaboratories/helpers@1.14.5

## 1.47.3

### Patch Changes

- 4ac0df5: Native table export now uses the disambiguated column labels shown in the table (from the `PlDataTable` `columnsMeta` sidecar) instead of the raw spec `pl7.app/label`. This fixes export failures when exporting a table with many columns whose intrinsic labels collide — the native `exportPTable` path rejects duplicate header names.

  `exportPTable`/`writePTableToFs` options gain an optional `headerNames` field (aligned 1:1 with `columnIndices`). It is additive and backward compatible: older runtimes ignore it and keep deriving header names from the column spec.

## 1.47.2

### Patch Changes

- 27600c3: Escape including label columns for non primary columns
- Updated dependencies [27600c3]
  - @milaboratories/helpers@1.14.5
  - @milaboratories/pl-error-like@1.12.10

## 1.47.1

### Patch Changes

- Updated dependencies [3314d0c]
  - @milaboratories/helpers@1.14.4

## 1.47.0

### Minor Changes

- 881d6ba: ColumnLazy / ColumnsCollection API that bring new way to work with columns in model part

## 1.46.4

### Patch Changes

- Updated dependencies [c07d2bb]
  - @milaboratories/helpers@1.14.3

## 1.46.3

### Patch Changes

- 3df748f: Project sharing (Copy & Share). The middle layer can share a copy of a project with named recipients or with everybody on the server, and recipients accept/reject pending shares into their own project list (cross-color attach). Re-sharing a project supersedes the donor's prior share of that same project: an everyone-share replaces the previous everyone-share, and a targeted share pulls each named recipient out of any earlier share of that project, deleting it if no recipients remain.

  - `pl-middle-layer`: sharing model + mutators and the `MiddleLayer` API — `shareProjects`, `acceptShare`, `rejectShare`, `revokeShare`, reactive `pendingShares` / `outgoingShares`; branded `ShareId`; 14-day outbox cleanup for targeted shares; the donor's own login and own pending shares are filtered out of the relevant views.
  - `pl-client`: `PlTransaction.revokeAccess` (revoke a single recipient's grant), `UserResources.listUsers`, and `listGrants`; regenerated gRPC bindings.
  - `pl-tree`: multi-root `SynchronizedTreeState` with `{kind:'shared'}` shared-resource discovery seeds, used for pending-share discovery. Discovery trees self-heal when a discovered grant is revoked/expired instead of failing the whole poll.
  - `pl-model-common`: register `SharingOutbox` / `SharingState` / `SharedEnvelope` resource type names.

  Revoking a share no longer disconnects the client: a per-resource signature failure (revoked grant) is distinguished from a dead session at the transport layer, so it no longer triggers a session reset. `revokeShare` is idempotent.

## 1.46.2

### Patch Changes

- 2760ae1: Add `BlobDriverMetrics` and `DownloadDriver.getMetrics()`: uncached (sparse-cache-bypass) request volume, live in-flight download gauges, and presigned-URL cache efficiency (hits / misses / stale hits / fetch latency).

## 1.46.1

### Patch Changes

- 958289c: Make inline-column data info self-contained: the pf-driver now embeds each inline column's `typeSpec` (`{ axes, column }`) into its `dataInfo` before query lowering, so the data layer no longer relies on the inline column's `spec` field for type information. `ColumnIdAndTypeSpec.spec` is changed to the singular `ColumnTypeSpec` to match the data-layer wire format.

## 1.46.0

### Minor Changes

- 60b13d1: Gate the xlsx export option in the UI on table size instead of failing after the dialog.

  `exportCsv` now calls `getShape` before opening the save dialog and drops the Excel filter when the table exceeds the per-sheet row limit, so oversized tables simply never offer xlsx rather than erroring out post-selection. The `pf-driver` rejection is kept as a safety net. The shared `XLSX_MAX_ROWS_PER_SHEET` constant is now exported from `@milaboratories/pl-model-common` so the UI gate and the driver check can't drift.

## 1.45.0

### Minor Changes

- b0c2b5f: Add `PFrameDriver.exportPTable(handle, { path, columnIndices })` — exports the table to a file natively via `PTableV10.export`, selecting the format from the `path` extension (`csv`/`tsv`/`parquet`/`xlsx`). `columnIndices` selects the columns to export; column headers are derived on the driver side from each field's label annotation (falling back to its spec name), the same way `writePTableToFs` builds CSV/TSV headers. For `xlsx`, the driver checks the table shape and rejects exports whose data rows exceed the 1,000,000-row per-sheet limit (below Excel's hard cap of 1,048,576). The driver currently voids `columnIndices` and exports the full table — it will be honoured once the `PTableV11` native update lands.

  Add the next PFrames addon interface version — `PFrameFactoryV7` / `PFrameV16` / `PFrameReadAPIV14` / `PTableV11` — where `PTableV11.export` takes `headers` as a `Record<number, string>` (unified column index → header name) that both selects the columns to export (its keys) and names them (its values), instead of a positional `string[]`. The current `V6`/`V15`/`V13`/`V10` surface is unchanged and still used by the driver; the new version is defined ahead of its PFrames implementation, after which the monorepo will migrate and drop the old one.

  `PlAgCsvExporter` no longer hardcodes the output format — it offers the available formats as save-dialog file-type filters and derives the format from the chosen path. When the runtime advertises `exportPTable` it exports the visible table handle directly (`csv`/`tsv`/`parquet`/`xlsx`, no gzip); otherwise it falls back to `writePTableToFs` (`csv`/`tsv`, plain or gzip-compressed depending on the chosen `.gz` extension).

## 1.44.0

### Minor Changes

- fbff717: Switch the PFrames addon surface to the `PFrameFactoryV6`/`PFrameV15`/`PTableV10` interface (`@milaboratories/pframes-rs-*` bumped to `1.1.41`) and drop the superseded `PFrameFactoryV5`/`PFrameV14`/`PFrameReadAPIV12`/`PTableV9` declarations.

  Add `PFrameDriver.exportPTable(handle, path)` to the driver surface and wire it through the service bridge. The method is a placeholder that always rejects with "not implemented" — the native export implementation will be added separately.

## 1.43.0

### Minor Changes

- 98092a6: Migrate pf-driver to the pframes-rs 1.1.38 V5 addon surface.

  - Bump `@milaboratories/pframes-rs-{node,wasip2,wasm}` to `1.1.38`.
  - `pf-driver` switches off the V4 addon API: `createTableV2({ tableSpec, dataQuery })` → `createTable(dataQuery)`, the per-column `addColumnSpec`/`setColumnData` loop → a single bulk `addColumns(...)`, and `getUniqueValues` now sends pre-resolved indices (`UniqueValuesRequestV2`) — axis indices via `expandAxes` + `findTableColumn`, filters via WASM-spec's stateless `rewriteLegacyFilters`. `params.tableSpec` is retained on the JS-side cache only.
  - `pl-model-middle-layer` drops the obsolete V4-era `PFrameInternal` interfaces (`PFrameFactoryAPIV4`, `PFrameReadAPIV11`, `PTableV8`, `PFrameV13`, `PFrameFactoryV4`); the published addon now implements `PFrameV14`/`PFrameFactoryV5`.
  - `pf-spec-driver` / `pl-model-common` expose `rewriteLegacyFilters` on `PFrameSpecDriver` (wired through the service registry and workflow VM bridge).

## 1.42.0

### Minor Changes

- 2b928af: `pframe/query` types now mirror the pframes-rs wire format. Tracks
  `@milaboratories/pframes-rs-node` / `-wasm` v1.1.34 → v1.1.35.

  New variants on `SpecQuery` / `DataQuery`:

  - `transformColumns` query node (`QueryTransformColumns`); the mode
    is `"append" | "replace"` (the runtime accepts the legacy `"add"`
    as a serde alias).
  - `cast`, `conditional` expressions.
  - `ranking` window function (with `RankingKind`).

  `isInPolygon`, `aggregation` (`AggregationKind`), and `cumulative`
  (`CumulativeOperand`) are present in the Rust query model but their
  DataFusion executors return errors today (filter.rs:276 / 340 / 387).
  The TS definitions are committed but commented out in `query_common.ts`
  so block authors can't construct a query the runtime won't execute.
  Re-enable in lock-step with the Rust wiring.

  Wire-shape fixes:

  - `ExprIfNull` is now `ExprFillNull`, tag `"fillNull"` (the runtime
    accepts `"ifNull"` as a serde alias).
  - `NumericBinaryOperand` gains `"power"`.
  - `Point2D` is now an `[x, y]` tuple, matching the Rust serialisation
    (previously typed as `{ x, y }`).
  - `ExprIsIn.negate` is now required `boolean` (previously optional).
    The Rust runtime keeps a tolerant deserialiser that defaults a
    missing `negate` to `false` and always re-emits the field; new
    callers should pass it explicitly.
  - `QuerySort.sortBy[].nullsFirst` is plain `boolean` (was
    `null | boolean`).
  - `QuerySparseToDenseColumn`: field renamed `axesIndices → axes` and
    parameterised over the layer's axis-selector type; at the spec layer
    entries are named `SingleAxisSelector`s, at the data layer they are
    numeric indices. Old wire field name still parses via a serde alias.

  One downstream consumer in `@platforma-sdk/model`
  (`filters/converters/filterToQuery.ts`) updated to pass `negate`
  explicitly on the `inSet` / `notInSet` paths and to migrate from
  `ifNull` to `fillNull`.

## 1.41.2

### Patch Changes

- 641c845: Fix table migration to v6

## 1.41.1

### Patch Changes

- Updated dependencies [6bac267]
  - @milaboratories/helpers@1.14.2

## 1.41.0

### Minor Changes

- cb9e0ba: Label columns for predefined columns and show in table label columns always

## 1.40.0

### Minor Changes

- 72a9e61: Support signatures tracking and strict security mode of backend

### Patch Changes

- @milaboratories/pl-error-like@1.12.10
- @milaboratories/helpers@1.14.1

## 1.39.0

### Minor Changes

- 731ab44: Add `requiresPFramesVersion` block feature flag. Blocks can declare a minimum PFrames version requirement; the middle layer registers the supported version as a runtime capability.

## 1.38.0

### Minor Changes

- 6369956: Show table with partial data

## 1.37.0

### Minor Changes

- a40505e: Add `EnrichmentRef` — a versioned envelope around a terminal column hit
  and an ordered linker path, mirroring `PrimaryRef`'s pattern so the
  dependency scanner deep-walks `PlRef`s inside it without changes. Adds
  `EnrichmentStep`, `isEnrichmentRef`, `createEnrichmentRef` exports.
  Today only `linker` steps are supported; the `type` discriminant leaves
  room for future step kinds.

  `tableBuilder.addColumn` / `addColumns` accept `EnrichmentRef` and
  `ResolvedEnrichmentRef`. The `:pframes.build-table` ephemeral registers
  the hit + every hop column in the PFrame, calls
  `pframes.build-query.buildQuery` to assemble the query, and hands the
  resulting `SpecQueryJoinEntry` straight to `pt.p._rawQueryEntry` — ptabler
  resolves the linker join natively, no node-by-node translation.

  Adds `pt.p._rawQueryEntry(columnsByName, joinEntry)` (internal — `_`
  prefixed) for wrapping a pre-built `SpecQueryJoinEntry` (e.g. from
  `bquery.buildQuery`) into a PEntry. Application code should compose
  with the public builders (`p.column / p.inner / p.linkerJoin / …`).

  The spec distiller now preserves the `pl7.app/isLinkerColumn`
  annotation on column specs (all other annotations are still stripped).
  ptabler reads this annotation at execution time to populate the spec
  frame's linker index — without it, `linkerJoin` queries silently
  degrade to inner joins.

  Drops the `qualifications` field from the typed shapes of
  `DiscoverColumnsLinkerStep`, `MatchVariant.path[]` items, and
  `DiscoveredPColumn`'s linker path items. Per-step linker qualifications
  were always empty (qualifications attach to query/hit ends, not to
  intermediate steps) — `BuildQuery` already discarded them, and the
  tooltip / `createPlDataTableV3` consumers were forwarding empty arrays.

  `DiscoveredPColumnId` no longer carries per-step `qualifications` in
  its canonicalized JSON form. The Rust side still emits the field on
  the wire; the TS deserializer ignores it.

## 1.36.2

### Patch Changes

- Updated dependencies [f28bb32]
  - @milaboratories/pl-error-like@1.12.10

## 1.36.1

### Patch Changes

- e5596f5: Migrate `pt` emitters and ptabler `read_frame` step to the `SpecQuery` shape, and fix a TS type bug.

  **`pl-model-common` type fix:** `QuerySliceAxes.axisFilters[i].axisSelector` was typed as `QueryAxisSelector<A>` (wrapped `{type: "axis", id: A}`), which disagreed with the wire format — Rust (`pframes-rs/packages/bridge/src/query/query_slice_axes.rs`) and Python (`polars_pf.json.query_spec.SpecQuerySliceAxisFilter`) both serialize `axis_selector` as the bare selector (`SingleAxisSelector` at the spec layer, `number` at the data layer). The Rust `serialize_slice_axes` test at `pframes-rs/packages/spec/src/query_spec/query.rs:381` confirms the flat wire. Updated `QuerySliceAxes<Q, A>` to take `A` unconstrained, updated `SpecQuerySliceAxes` to use `SingleAxisSelector` directly and `DataQuerySliceAxes` to use `number` directly, and corrected the jsdoc example.

  - `pt.p.column/slicedColumn/inner/full/outer` now emit `SpecQueryJoinEntry` nodes (`column`, `sliceAxes`, `innerJoin`, `fullJoin`, `outerJoin`) byte-compatible with the output of `PFrameSpecDriver.buildQuery`.
  - Added `pt.p.linkerJoin` for emitter completeness against the `SpecQuery` union.
  - `read_frame.request` is now `PTableDefV2<PObjectId>` (`{ query: SpecQuery }`) — dropped the legacy `{ src, filters: [] }` sibling shape. The `filters` list goes away because filters live as `SpecQueryFilter` nodes inside the query tree.
  - ptabler Python step (`ptabler.steps.read_frame.ReadFrame`) takes `PTableDefV2` and forwards `request.query` directly to `polars_pf.pframe_source`, which accepts `SpecQuery` natively.
  - Bumped `polars-pf` requirement to `1.1.27` (shipped in `runenv-python-3.12.10@1.3.9`; catalog `runenv-python-3` bumped `1.7.4 → 1.8.0` to pull it in). Updated the `test_duplicate_axis_values_failure` assertion to match the new error wording ("multiple rows with the same axis key").
  - `slicedColumn` no longer uses the `new_id`/`column_id` rename pair — each slice wraps a direct `Column(name)` reference under a `sliceAxes` node with axis selectors resolved from the column's `axesSpec`. This aligns with the Rust upgrade rule that rejects `new_id != column_id` (see `pframes-rs/packages/spec/src/requests/query_upgrade/logic.rs:35`).

## 1.36.0

### Minor Changes

- 5420fea: Add PTableDownloadFormat, DownloadPTableOptions, and DownloadPTableResult types for PTable file export support
- 5420fea: Expose native PTable download via `PFrameDriver.downloadPTable(handle, options)` (optional, present only in the desktop runtime). `DownloadPTableCsvOptions` moved to `@milaboratories/pl-model-common`. The earlier `PlatformaV3.downloadPTableCsv` bridge is removed in favor of the driver-level method.
- 5420fea: Replace legacy `PFrameDriver.writePTableToFs?` with two modern services:
  `Dialog.showSaveDialog` (new `main`-kind service for native save dialogs)
  and `PFrame.writePTableToFs` (now a required method on the UI-facing
  driver, accepting a caller-provided `path`). `exportCsv` in `ui-vue`
  now opens the save dialog and invokes the write as two separate
  service calls.

## 1.35.0

### Minor Changes

- 10eec21: Add `PrimaryRef` type (dataset + optional filter), `createPrimaryRef` factory, `isPrimaryRef` type guard, `DatasetInput` union, and `DatasetOption` type for dataset selection with filter choices. Fix `createPlRef` return type to properly narrow `__isRef` literal.

## 1.34.1

### Patch Changes

- a2304be: refactoring column_collection_builder

## 1.34.0

### Minor Changes

- 8eb112a: update linker connection order

### Patch Changes

- 8eb112a: update tests

## 1.33.0

### Minor Changes

- 1411dea: Expose `buildQuery` and `listColumns` on `PFrameSpecDriver`:

  - `buildQuery(input: BuildQueryInput): SpecQueryJoinEntry` — pure
    spec-layer assembler that turns a terminal column plus an ordered
    path of wrapping steps (linker hops, filter joins) into a
    ready-to-compose `SpecQueryJoinEntry`. No frame handle is required
    (wires directly to the top-level export from `pframes-rs-wasm`).
  - `listColumns(handle: SpecFrameHandle): PColumnInfo[]` — enumerates
    every column registered in the spec frame. `hasData` is always
    `false` for spec-only frames.

  Both are also routed through the QuickJS service injector, so block
  models can call `ctx.services.pframeSpec.buildQuery(...)` and
  `ctx.services.pframeSpec.listColumns(handle)`.

  Bumps `@milaboratories/pframes-rs-wasm` to 1.1.26 (corrected V3:
  `buildQuery` at top level, `listColumns` on the frame resource). The
  pool type switches from `PFrameWasmV2` to `PFrameWasmV3`.

## 1.32.1

### Patch Changes

- 49485fd: Correct `PFrameWasmV3` shape:

  - Move `buildQuery` from the per-frame interface to the API factory
    (`PFrameWasmAPIV3`). It is pure over its input and does not consult
    frame state, so it should not require a frame instance.
  - Add the missing `listColumns(): PColumnInfo[]` on the per-frame
    interface, mirroring `PFrameReadApi.listColumns` on the data layer.

  `PFrameWasmV2` / `PFrameWasmAPIV2` are kept as legacy shims until the V3
  surface is implemented on the pframes-rs side and `pframes-rs-wasm`
  stops returning V2 from its top-level exports.

  Requires a matching `pframes-rs-wasm` release that exposes `buildQuery`
  as a top-level export and `listColumns` on the frame resource.

## 1.32.0

### Minor Changes

- 436d4a9: Add LinkerJoin query node (spec + data layers) mirroring OuterJoin's shape,
  with a specialized linker sub-struct and a non-empty array of secondary join
  entries. Introduces `PFrameWasmV3` adding `buildQuery`: a pure spec-layer
  assembler that turns a terminal column plus an ordered path of wrapping
  steps (linker hops, filter joins) into a ready-to-compose
  `SpecQueryJoinEntry`. Extends `DiscoverColumnsStepInfo` with a `filter`
  variant and adds `BuildQueryInput` in `pl-model-common`. V2 interfaces
  remain as legacy shims pointing to V3 and will be removed in a future
  PFrames update.

## 1.31.2

### Patch Changes

- 9c3b6c2: Export isAnyLogHandle type guard and branded log handle types added in the MCP server PR.

## 1.31.1

### Patch Changes

- Updated dependencies [6dc9e0d]
  - @milaboratories/helpers@1.14.1

## 1.31.0

### Minor Changes

- 5becf87: Remove PTableAbsent concept — absent values are now null (same as NA)

## 1.30.0

### Minor Changes

- 74a2ffa: Add block-level services infrastructure (PFrameSpec, PFrame)

  - Introduce `Services` registry in pl-model-common with service definitions, feature flags, and typed driver interfaces
  - Add `PFrameSpec` service: synchronous WASM-based spec operations (createSpecFrame, discoverColumns, evaluateQuery)
  - Wire services through block model, plugin model, and UI layers with compile-time `RequireServices` constraints
  - Add `ColumnCollection` with `dispose()` for deterministic spec frame cleanup. **Breaking:** `ColumnCollection` and `AnchoredColumnCollection` now extend `Disposable` — custom implementations must add a `dispose()` method
  - Add `createPlDataTable` v3 API using `ColumnCollectionBuilder` with include/exclude column selectors
  - Auto-dispose leaked SpecFrame handles via `addOnDestroy` in computable lifecycle. **Breaking:** `PFrameSpecDriver.createSpecFrame` now returns `PoolEntry<SpecFrameHandle>` instead of `SpecFrameHandle`; `disposeSpecFrame` removed — use `entry.unref()` instead
  - Add `PoolEntry`, `PoolEntryGuard` to pl-model-common for cross-package pool entry lifecycle management
  - Add `ServiceRegistryBase.dispose()` for proper service cleanup; wire disposal in middle layer and UI
  - Migrate `PFramePool` from `RefCountManualPoolBase` to `RefCountPoolBase` with idempotent unref; remove `RefCountManualPoolBase`
  - Add `requireComputableCtx` getter to centralize computable context guards; migrate `createPFrame`/`createPTable`/`createPTableV2` to use `PoolEntryGuard` for leak-safe resource handling
  - Move pf-spec-driver logging before WASM calls for better crash diagnostics
  - Fix outputWithStatus in plugin model
  - Fix table row selection not propagating to selection model
  - Fix linker columns with `pl7.app/parents` annotation failing WASM validation ("must have exactly 2 connected components") by resolving annotation-based parents to numeric `parentAxes` before passing specs to Rust/WASM engine

## 1.29.0

### Minor Changes

- cfee265: Drop V1 DiscoverColumnsRequest/PFrameWasm/PFrameWasmAPI, adopt V2 interfaces; update DiscoverColumnsRequest in common with includeColumns/excludeColumns/maxHops fields; extract SpecDriver into @milaboratories/pf-spec-driver package; rename specFrameDispose to disposeSpecFrame for API consistency

## 1.28.0

### Minor Changes

- e1d62fe: Add V2 discover columns WASM interface: PFrameWasmV2/PFrameWasmAPIV2 with separate include/exclude column filters, maxHops parameter, linker path traversal in response hits, and DiscoverColumnsLinkerStep/StepInfo types

## 1.27.0

### Minor Changes

- d59f5fe: New collection columns implementation

### Patch Changes

- Updated dependencies [d59f5fe]
  - @milaboratories/helpers@1.14.0

## 1.26.1

### Patch Changes

- 227002e: remove back direction in linkers

## 1.26.0

### Minor Changes

- b4036fb: Add contextDomain support across the platform

  - Add `contextDomain` field to AxisId, AxisSpec, PColumnSpec and related types
  - Add `contextDomainAnchor` to AnchoredPColumnSelector with full pack-based optimization in AnchoredIdDeriver
  - Extend spec distiller, matchers, xsv-builder, and query resolution to handle contextDomain
  - Add contextDomain to discoverColumns API types (MultiColumnSelector, MultiAxisSelector)
  - Add feature-flag-gated ContextDomain query predicate in query-anchored template
  - Add client-side contextDomain post-filter template for old backends without ContextDomain query support
  - Rename `additionalDomains` to `contextDomain` in SpecQueryJoinEntry and AxisQualification

## 1.25.3

### Patch Changes

- 15959f8: Add support feature flags for UI

## 1.25.2

### Patch Changes

- 79156bc: fix dense axis
- Updated dependencies [79156bc]
  - @milaboratories/pl-error-like@1.12.9

## 1.25.1

### Patch Changes

- 523a59f: Version bump

## 1.25.0

### Minor Changes

- 01d0b52: BlockModelV3 update

## 1.24.11

### Patch Changes

- cb28fde: FilterSpec strict types, fast table search

## 1.24.10

### Patch Changes

- 866a323: Apply user filters, add utils method for traversing

## 1.24.9

### Patch Changes

- a3659cd: Add well-known constants for commonly used PColumn names, PAxis names, Domain keys, and Annotation keys (VDJ clustering, scores, lead selection, etc.)

## 1.24.8

### Patch Changes

- 4f04561: simplify distil , renaming

## 1.24.7

### Patch Changes

- 0ae1854: createPTableV2 + Advanced filter in AgTable
  - @milaboratories/pl-error-like@1.12.8

## 1.24.6

### Patch Changes

- Updated dependencies [c620234]
  - @milaboratories/pl-error-like@1.12.8

## 1.24.5

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/pl-error-like@1.12.7

## 1.24.4

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/pl-error-like@1.12.6

## 1.24.3

### Patch Changes

- 0099ff7: small updates

## 1.24.2

### Patch Changes

- 4713838: query_data, query_spec types

## 1.24.1

### Patch Changes

- f819dfd: Added well-known VDJ labels

## 1.24.0

### Minor Changes

- 1694d1a: Platforma API v3

## 1.23.0

### Minor Changes

- fc75a16: Added `OutputWithStatus` type

## 1.22.0

### Minor Changes

- 88f33fa: Block model upgrade: subtitle, tags, and section badges

## 1.21.10

### Patch Changes

- 5deb79a: add linkers to column_collection

## 1.21.9

### Patch Changes

- bf6fe49: Update advanced filters and types

## 1.21.8

### Patch Changes

- 2c07d5a: Return null instead of error when column not found

## 1.21.7

### Patch Changes

- d088e83: add pl-advanced-filter

## 1.21.6

### Patch Changes

- 17e5fe7: Get rid of circular reference

## 1.21.5

### Patch Changes

- 55b218b: PFrameDriver decomposed

## 1.21.4

### Patch Changes

- 38da155: PlBtnExportArchive added

## 1.21.3

### Patch Changes

- bb07805: xsv.exportFrame migration to ptabler

## 1.21.2

### Patch Changes

- d5a8713: Lint/type fix

## 1.21.1

### Patch Changes

- e8adc3b: Fix Unmatched condition error, disappeared blocks

## 1.21.0

### Minor Changes

- ef22c49: Moved HTTP Authorization header parser/serializer from helpers to pl-model-common

### Patch Changes

- 5ecb368: lint fix

## 1.20.1

### Patch Changes

- 5d4774c: add annotations

## 1.20.0

### Minor Changes

- 916de57: node version bump

## 1.19.19

### Patch Changes

- 662eee0: PFrames - spec update to support artificialColumn join entry

## 1.19.18

### Patch Changes

- 49160c4: Revert BlobDriver interface

## 1.19.17

### Patch Changes

- 6bc20d1: add hidden for graphs columns

## 1.19.16

### Patch Changes

- 3d9638e: PFramesDriver run HTTP parquet server

## 1.19.15

### Patch Changes

- Updated dependencies [0ff2a1b]
  - @milaboratories/pl-error-like@1.12.5

## 1.19.14

### Patch Changes

- 2a21be5: Added `pl7.app/description` to well-known annotations list

## 1.19.13

### Patch Changes

- c792469: Set type to module for packages used by PFrames

## 1.19.12

### Patch Changes

- 2589dec: Export Branded type from model-common

## 1.19.11

### Patch Changes

- b14b2fb: update dist builder
- Updated dependencies [b14b2fb]
  - @milaboratories/pl-error-like@1.12.4

## 1.19.10

### Patch Changes

- e3e69bd: fix axes normalizaion

## 1.19.9

### Patch Changes

- 6b9828a: Remove unused styles, fix lint warnings, update comments

## 1.19.8

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/pl-error-like@1.12.3

## 1.19.7

### Patch Changes

- 078efc1: fix for linker columns

## 1.19.6

### Patch Changes

- 4468f99: add composite linker columns

## 1.19.5

### Patch Changes

- 4b67e4f: PFrames driver - integrated parquet data info handling

## 1.19.4

### Patch Changes

- b8105fb: PFrames - Different public and internal types for ParquetDataInfo

## 1.19.3

### Patch Changes

- 6d6c4ba: Updated ParquetPartitionedDataInfo specification

## 1.19.2

### Patch Changes

- 017a888: ParquetPartitionedDataInfo specification

## 1.19.1

### Patch Changes

- 636088d: Removed PValue type everywhere, use PTableValue for UI operations instead
- 636088d: PFrames - update PTableVector format

## 1.19.0

### Minor Changes

- 98b0ded: drivers: frontend: replace path with url with custom protocol and signature

## 1.18.0

### Minor Changes

- 3271446: MSA: added export functionality

## 1.17.0

### Minor Changes

- e7c0edb: Platforma API v2 (long pooling) + support v1 api in sdk

## 1.16.5

### Patch Changes

- 9bb26ff: PlAgDataTableV2 - linker columns handling fix

## 1.16.4

### Patch Changes

- c12345a: createPFrameForGraphs update

## 1.16.3

### Patch Changes

- 7be8a2b: Adopt PFrameError

## 1.16.2

### Patch Changes

- dfb0086: Intruduced PFrameError

## 1.16.1

### Patch Changes

- d525c60: PFrames - support InSet filter

## 1.16.0

### Minor Changes

- 3b46d33: Refactored block configuration model and introduced a feature flag system. This provides a more robust way to manage different block config versions and check for feature compatibility.

## 1.15.9

### Patch Changes

- bd788f9: PFrames driver - accept partitionFilters separately from all other fields

## 1.15.8

### Patch Changes

- 8236387: Grouping in PlDropdown

## 1.15.7

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/pl-error-like@1.12.2

## 1.15.6

### Patch Changes

- 6ffe944: PlAgDataTableV2 refactoring
- 6ffe944: PlAgDataTable types fixed

## 1.15.5

### Patch Changes

- 49cf7ee: Standard Error serialization/deserialization

## 1.15.4

### Patch Changes

- 61aa680: Bug cutting empty domain{} from spec fixed

## 1.15.3

### Patch Changes

- f191f2a: drivers: download: add sparse cache for ranges

## 1.15.2

### Patch Changes

- 1cbbd66: PFrame driver - accept range in calculateTableData

## 1.15.1

### Patch Changes

- 89fd5d3: drivers: download: implement definitions in middle layer
- 7878cb5: drivers: download: add range

## 1.15.0

### Minor Changes

- b0b80af: - fix for label derivation with enough diversity solaly in labels
  - fallback behaviour for derive labels function
  - deduplication of columns in column collection

## 1.14.1

### Patch Changes

- 94468e0: PFrames version bump

## 1.14.0

### Minor Changes

- 01a558e: Explicit enrichment tracking in model and refs:
  - requireEnrichments flag added to PlRef
  - enriches lambda added to model builder
  - ctx.getOptions(...) now allows to create options with references requiring enrichments
  - helper methods to create PlRef's and to manipulate requireEnrichments flag

## 1.13.8

### Patch Changes

- Updated dependencies [141aebc]
  - @milaboratories/pl-error-like@1.12.1

## 1.13.7

### Patch Changes

- f9bc9a8: Add Json branded by stringified type

## 1.13.6

### Patch Changes

- 621e15a: PlAgDataTableV2 component (does not include hidden columns in join)

## 1.13.5

### Patch Changes

- 21233c2: - Reverted wrong annotations field in anchored bquery schema (#722)
  - Fixed pColumn bundle.xsvTableBuilder for work with long file names
  - Fixed anchored axis spec in canonicalOptions
  - Allow optional domains in canonicalOptions
  - Removed do-pack from tests

## 1.13.4

### Patch Changes

- 43e1c65: AnchorColumns API refactoring

## 1.13.3

### Patch Changes

- Updated dependencies [ff0f92c]
  - @milaboratories/pl-error-like@1.12.0

## 1.13.2

### Patch Changes

- 962c620: Full migration to PFrames Rust

## 1.13.1

### Patch Changes

- 2fc07ba: Fix NaN check for PValue float types

## 1.13.0

### Minor Changes

- 7c52bb5: DataInfo types moved to common type from Internal API to allow explicit construction of PColumn data from within the block's model

## 1.12.0

### Minor Changes

- 88cebeb: Anchored Column Id / Selector API; (S)UniversalColumnId

## 1.11.4

### Patch Changes

- 9e9a70f: Configure eslint to all "node" packages

## 1.11.3

### Patch Changes

- 4812a12: apply eslint rules to the all "model" packages

## 1.11.2

### Patch Changes

- 5f0fb1d: [sdk/ui-vue] PlAgDataTable hidden columns are shown as visible after selecting empty dataset

## 1.11.1

### Patch Changes

- b084260: Branded CanonicalPColumnId type

## 1.11.0

### Minor Changes

- 1016b99: Added APColumnSelector, PColumnSelector and APColumnId interfaces for column selection and AnchorIdDeriver class

## 1.10.6

### Patch Changes

- 819c13c: PColumnSpec.valueType extended to "ValueType | string"

## 1.10.5

### Patch Changes

- 388c9d2: add getProgressLogWithInfo to log driver

## 1.10.4

### Patch Changes

- ce558f9: add blob to url driver that decompress the folder and returns url to the blob
- b41709a: new driver: blob to url that unarchive things

## 1.10.3

### Patch Changes

- 32966e6: [desktop] Custom design for “+ add graph“ etc. sections

## 1.10.2

### Patch Changes

- 079f50e: PlId type moved to SDK model

## 1.10.1

### Patch Changes

- 8903a30: Dependency upgrade

## 1.10.0

### Minor Changes

- 4d9885b: pFrameDriver inline columns support

## 1.9.0

### Minor Changes

- 6efea3d: PlAgDataTable unified data format

## 1.8.1

### Patch Changes

- 02feb1a: Many utility functions for convertion, serialization and deserialization of PValues

## 1.8.0

### Minor Changes

- dfad2d0: PFrames case insensitive filters

## 1.7.0

### Minor Changes

- a5100ac: PFrames case insensitive filters

## 1.6.4

### Patch Changes

- e0f0eed: Ref -> PlRef

## 1.6.3

### Patch Changes

- 6f56890: getFileNameFromHandle method added

## 1.6.2

### Patch Changes

- b04a78a: Minor improvements for mapPObjectData typing

## 1.6.1

### Patch Changes

- a5af4f2: Added findDataWithCompatibleSpec method for result pool

## 1.6.0

### Minor Changes

- 05751fa: Method fileToImportHandle added to LS driver API

## 1.5.2

### Patch Changes

- 612a9be: fix for isPColumnSpecResult type guard

## 1.5.1

### Patch Changes

- 8e9424a: isPColumnSpecResult / isPColumnResult / isLiveLog type guards

## 1.5.0

### Minor Changes

- 9dae9aa: removed isInitialPathHome flag

## 1.4.0

### Minor Changes

- 66383b6: New public API in LS driver: showOpenSingleFileDialog, showOpenMultipleFilesDialog, getLocalFileSize, getLocalFileContent

## 1.3.15

### Patch Changes

- eb079e9: Support heterogeneous axes in PlAgDataTable

## 1.3.14

### Patch Changes

- 13013ee: PlAdDataTable auto-join label-columns

## 1.3.13

### Patch Changes

- 6d4cf3e: migrate away from unique-symbol based branding to branding with string field names

## 1.3.12

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig

## 1.3.11

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json

## 1.3.10

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
