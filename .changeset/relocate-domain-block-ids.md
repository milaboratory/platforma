---
"@milaboratories/pl-model-common": minor
---

Applying a template repoints the block ids held inside a domain.

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
