---
"@platforma-sdk/ui-vue": patch
"@milaboratories/uikit": patch
---

Fix an infinite grid-remount loop in `PlAgDataTableV2` that recreated the whole
AG Grid around twenty times a second — strobing the column headers and filling
the console with AG Grid licence banners — on opening a page whose table had a
saved grid state, most often right after a block rebuild.

`computedCached`'s `writeThrough` made a set visible to readers immediately, but
the cache was still overwritten whenever the source re-emitted. A set is
debounced, so between the write and its arrival in the project state the source
still holds the value the write moved away from; a running block has that state
pushed back repeatedly, and each push reverted the cache. The stored grid state
therefore flipped between what the grid had and what the project still held, and
every flip made the reload watch destroy and recreate the grid — which, because
the flips never stopped on their own, never converged.

A write-through value now stays authoritative until the source reports it back.
Since `get` maps set values to themselves, that is exactly when the round trip
has completed; a change from elsewhere arriving mid-flight is dropped in favour
of the local write that is about to land.
