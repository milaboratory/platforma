---
"@milaboratories/uikit": patch
---

`PlTooltip`: flip to the opposite side when the requested `position` has no room (top ↔ bottom, left ↔ right); the beak follows the box. Pure CSS via `position-try-fallbacks`; the beak anchors to both the target and the box, so it needs no flip state.
