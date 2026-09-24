---
"@milaboratories/pl-model-common": patch
"@platforma-sdk/model": patch
---

Column enumeration leaves out a column whose `.spec` or `.data` field carries an error, and skips a map field that has an error and no value. One failed export no longer fails `ColumnsCollection` or `getColumns()` for the whole block; its healthy columns stay listed. A healthy PFrame costs one extra error read, so listing does not add recomputations.
