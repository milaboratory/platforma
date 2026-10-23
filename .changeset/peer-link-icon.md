---
"@milaboratories/pl-model-common": minor
"@milaboratories/uikit": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

Mark columns reached through a peer link with a link icon. A peer link joins two datasets' main axes (the second axis of a `pl7.app/isAnchor` column), e.g. a clonotype to its nearest known antibody, so the columns behind it describe a different clonotype than the row. Hovering the icon shows "Reached via <link label>".

- `PlColumnLabel` (uikit) takes an option (`{ label, linkHint }`) and draws the label with the link icon and its hover text. Every table and dropdown below uses it.
- Tables: the header, Manage Columns and the table filter show the icon, and list peer-linked columns after the others. `PlDataTableColumnMeta.linkHint` carries the hover text, the same field dropdown options use. Same-named columns reached through different links, or one through a link and one directly, no longer get a "via" postfix; the icon and its hover text tell them apart.
- Dropdowns: options take an optional `linkHint`, the hover text. `PlDropdown` shows it on the icon, and on the closed field's tooltip. `deriveColumnOptions` and the new `deriveRecipeOptions` set it and list peer-linked options last.
- New helpers: `collectDatasetAxes`, `getResultPoolDatasetAxes`, `findPeerLinks`, `describePeerLinks`, `createPeerLinkFinder`, `peerLinkedLast`.
