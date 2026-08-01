---
"@platforma-sdk/ui-vue": minor
---

Skip block data writes that would store what is already stored

`createAppV3` now compares each outgoing `update-block-data` payload against the last value it
sent, and drops the write when they are byte-identical.

Reactive watchers re-fire whenever `app.model.data` is replaced, and it is replaced wholesale on
every applied patch — so a block that assigns into `app.model.data` from a watcher re-writes
identical data as a matter of course. Each of those costs a full round trip plus the middle
layer's entire render fan-out.

Measured against a real backend: selecting a block issued 3 writes of a 38 KB payload, two of
them byte-identical; a second block issued 2 writes of a **280 KB** payload, one byte-identical.

The comparison is against the last *sent* value rather than the current snapshot, because the
snapshot lags behind in-flight writes — comparing against it could drop a genuine revert issued
before the previous write's patch arrived. Values that cannot be serialised are treated as
"not comparable" and always written.
