---
"@milaboratories/pl-model-common": minor
"@milaboratories/uikit": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
---

Mark columns reached through a peer link with a link icon. A peer link joins two datasets' main axes (the second axis of a `pl7.app/isAnchor` column), e.g. a clonotype to its nearest known antibody, so the columns behind it describe a different clonotype than the row. Hovering the icon shows "Reached via <link label>".

- Tables: the header, Manage Columns and the table filter show the icon, and list peer-linked columns after the others. `PlDataTableColumnMeta.peerLinks` carries the link labels. A plain column and a peer-linked one with the same name no longer get a "via" postfix.
- Dropdowns: options take an optional `linkHint`; `PlDropdown` shows a link icon with it as hover text. `deriveColumnOptions` and the new `deriveRecipeOptions` set it and list peer-linked options last.
- New helpers: `collectDatasetAxes`, `getResultPoolDatasetAxes`, `findPeerLinks`, `describePeerLinks`, `createPeerLinkFinder`.
