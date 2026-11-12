---
"@platforma-sdk/model": patch
---

`createPFrameForGraphs` no longer fails with `Duplicate column id … in provider ResultPool` when a block passes result pool columns among its own columns under their result pool ids. A column offered by several column providers is taken once, from the first of them; the same id is an error only within one provider, or when two providers give it to different columns.
