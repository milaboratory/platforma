# Amendment — References In `template-v1`

Amends the schema shared by [`02-export.md`](./02-export.md) and
[`03-import.md`](./03-import.md). Status: **implemented** (`05e901eee`, `5d810ec7a`).
Nothing here is released — `template-v1` is not on main and no template has shipped — so this
replaced the earlier shape in place, with no `v2` and no migration path for existing files.

## What Changed

The template engine used to parse column identifiers in order to move block ids between
projects. That meant it carried a model of the whole reference system: five key forms, nesting
by string, canonicalization, identifiers in map keys. Every time that system grew, the engine
would have to grow with it — or silently drop whatever it did not recognize.

It parses nothing now. A block's params travel **as is**, and the only structure anyone
downstream recognizes is a wrapper:

```ts
type TemplateRef<T> = { $ref: T };
```

The SDK puts those wrappers on inside the block's own bundle, where the reference system is
already known; the document stores what is inside them verbatim; apply redirects the block ids
inside a payload textually and hands the payload back unwrapped.

Three layers, and each knows exactly one thing:

| Layer | Knows |
|-------|-------|
| `wrapTemplateRefs` (`pl-model-common`, runs in the block's bundle) | which values are column identifiers |
| the document | that `{ $ref: … }` marks something redirectable |
| `remapRefPayload` / `resolveTemplateRefs` | how to replace a JSON string token |

## The File

Params are the block's own values, with wrappers where the identifiers were. Kind names below
are illustrative; the golden fixture this mirrors is
`lib/node/pl-middle-layer/test_fixtures/template-v1/wrapped-refs.yaml`.

```yaml
schema: template-v1
blocks:
  - id: aaaaaaaa-0000-4000-8000-000000000001
    kind: "@platforma-open/milaboratories.import-fastq.kind@2.1.0"
    params: {}

  - id: bbbbbbbb-0000-4000-8000-000000000002
    kind: "@platforma-open/milaboratories.clonotype-browser.kind@1.2.10"
    params:
      # A filtered column id: a canonical JSON string with the block id buried two encodings
      # deep. Written exactly as the block stored it — ugly, and nobody has to read it.
      anchor:
        $ref: '{"__isFiltered":true,"axisFilters":[[0,"IGH"]],"source":"{\"__isRef\":true,\"blockId\":\"aaaaaaaa-0000-4000-8000-000000000001\",\"name\":\"clonotypes\"}"}'
      # The same column as a `PlRef` object, marked the same way.
      upstream:
        $ref:
          __isRef: true
          blockId: aaaaaaaa-0000-4000-8000-000000000001
          name: clonotypes
      # Each identifier is marked where it sits, so an array of references is an array of
      # wrappers rather than one wrapper around the array.
      inputs:
        - $ref:
            __isRef: true
            blockId: aaaaaaaa-0000-4000-8000-000000000001
            name: reads
      # Ordinary data, untouched: a uuid that is a sample id, not a reference.
      sampleId: 3f1b8c2e-5d4a-4c9f-8b17-2a6e0d9f4c31
      species: hsa
```

`blockId` inside a payload names a **template entry**, which on export is the block's own
project-local id — a template has no id namespace of its own, so nothing is renamed on the way
out.

## How A Redirect Reaches A Nested Id

`remapRefPayload` serializes the payload, replaces the ids, and parses it back. The pattern is
`String.raw`(\\*")(id1|id2)(\\*")`` — whole JSON string tokens, with **any run** of backslashes
escaping their quotes.

That run is the whole trick. One JSON encoding around an identifier means one backslash before
its quotes, two means three, three means seven. Because the run is unbounded, nesting depth
does not exist as a case: a filtered id over a discovered id over a leaf matches at exactly one
place, and the delimiters found are put back unchanged.

Anchoring on the quotes is not cosmetic: without it an entry id of `a` would rewrite the `a`
inside an unrelated `"reads"`. Both properties are pinned in
`lib/model/common/src/template/template_ref.test.ts`.

Canonical form survives, because canonical JSON sorts keys and a redirect only changes values.
The one exception is below.

## Normative Behavior

### The Marker

When projecting a block's template params, the SDK shall wrap each column identifier it
recognizes in a `{ $ref: … }` wrapper.

The SDK shall recognize a column identifier in either spelling — the key object and the
canonical string — at any depth inside the params, and under any number of `JSON.stringify`
passes.

The SDK shall not descend into a value it recognized as a column identifier.

The SDK shall leave a value that is already wrapped unchanged.

### Document Parser

The document parser shall treat an object whose only key is `$ref` as a reference.

The document parser shall not treat any other value inside an entry's `params` as a reference.

The document parser shall not inspect what a reference wraps.

### Exporter

The exporter shall write an entry's `params` exactly as the block projected them.

### Apply

When applying a template, the apply engine shall replace, inside each reference payload, every
template-local entry id it was given with the block id that entry received.

The apply engine shall replace each reference with its payload once the payload has been
redirected.

If a reference payload names an entry that has no block, then the apply engine shall leave that
name unchanged.

### Reference Validator

The reference validator shall report a reference whose payload names the entry holding it as
`self`.

The reference validator shall report a reference whose payload names an entry declared later in
`blocks` as `forward`.

The reference validator shall not report a reference whose payload names an id the document
does not define.

## What Was Deleted

- `TemplateLocalRef` — the `{ block, output }` notation, and the reservation of that shape
  inside opaque params.
- The `columns` dictionary, its interner, and the `as` surface-form marker at each reference
  site. Interning deduplicated identifiers and gave block ids a single home, but it required
  the engine to take identifiers apart.
- The params codec: `TemplateForm`, `toTemplateForm`, `fromTemplateForm`.
- `remapColumnIdBlockIds` and its walk (`remapIdString`, `remapKey`, `remapDiscoveredKey`),
  added earlier on this branch and left with no callers.
- Both guards over an entry's params — the export-side check for block ids outside a wrapper
  and for wrapped ids naming a block the project does not contain, and the import-side
  `foreignBlockIds`. All three were the last places the engine modelled references.

Kept: `peelJsonLayers`, which the project's own reference detector
(`inferAllReferencedBlocks`) is built on, now with tests of its own in
`lib/model/common/src/drivers/pframe/spec/ids.test.ts`.

## What The Engine Can No Longer Report

Each of these is pinned by a test that states the boundary rather than the behaviour, so it
reads as a decision and not as a bug waiting to be fixed.

1. **A reference a block did not wrap.** Written out as data; the applied block is wired to
   nothing. Not the engine's business — which values carry block ids is the block's statement
   to make, and getting it wrong is a defect in the block like any other. Since the SDK now
   marks references automatically, reaching this requires a genuinely unrecognizable carrier.
2. **A reference to a block the project no longer contains.** Deleting a block does not rewrite
   what pointed at it, so a live project holds these routinely. Surfaces on apply.
3. **A dangling reference** — an id naming no entry in the file. Detection asks which of the
   ids the document defines appear in a payload, so an id naming none is indistinguishable from
   the rest of the payload's text.

All three need the same thing: knowing which values are identifiers.

## Still Open

- **Canonical key order when an identifier is a map key.** `ColumnDiscoveredKey.queriesQualifications`
  is `Record<PObjectId, …>`, and a redirect there changes what the sorted order should be — the
  result is valid JSON that is no longer canonical, so it is a different string from the
  identifier the same column would have in a fresh project. Only string equality suffers.
  Pinned by a test; fixing it means either re-canonicalizing a payload after the redirect
  (JSON knowledge, not reference knowledge, but it would have to guess which nested strings are
  JSON) or normalizing the shape on the way out, which contradicts storing values as is.
- **Blocks built before this change.** The params projection used to run inside the block's
  bundle in its old form, and that bundle is frozen in `model.json` (`code.content`, stamped
  with `sdkVersion`). Such a block still emits the old shape, and the engine — modelling
  nothing — writes it out. Rebuilding every block is required either way on this branch, since
  `kind` became mandatory; the open question is whether `BLOCK_STORAGE_FACADE_VERSION` should be
  raised so an un-rebuilt block is refused instead of producing a template that does not work.
