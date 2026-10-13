---
"@platforma-sdk/model": patch
---

Derived labels no longer tell same-named columns apart only by what one of them lacks. When a column's shown label parts are a strict subset of a same-named column's (for example "Enrichment Quality" next to "Enrichment Quality / Sequence clustering"), either the group is re-labelled from the parts all its members carry, such as each enrichment block's subtitle, or the bare column adds a part that differs from its peer (a trace entry or a qualification tag), preferring the same kind of part the peer shows. The more important of the two distinctions wins. When the native label is shown, the added part also appears on every same-named column that carries it, so the group reads consistently; when it is not, only the bare column changes. Qualification tags are kept, labels stay unique across the list, and a single repair pass replaces the previous by-presence repair.
