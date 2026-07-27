---
"@platforma-sdk/ui-vue": patch
"@platforma-sdk/model": patch
---

PlDataTable: allow the default filter group to be fully cleared, and harden filter merging.

- `PlAdvancedFilter`: when the last leaf of a non-removable group (e.g. the pinned default-filters group) is deleted, keep it as an empty group instead of splicing the whole group out. This lets the default-filters group be emptied (previously the last default filter could not be removed); the group's reset still restores the defaults.
- `createPlDataTableV3.concatFilters`: AND-combine operands that are not `and` groups (a bare leaf, a `not`, or an `or` group) by treating them as single members, instead of assuming every operand has a `.filters` array. Fixes a `TypeError` crash when the persisted filter state is a lone leaf (e.g. a single sheet selection) and a case where an `or` root was incorrectly OR-merged with the defaults.
