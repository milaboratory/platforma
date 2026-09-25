---
"@platforma-sdk/ui-vue": patch
---

Stop `PlAgDataTableV2` leaving its loading overlay up forever when the block it
shows re-runs. The table would sit on "Loading data…" with no columns, long
after the block had finished and its table handles were ready.

The settings watch bumped a generation counter on every settings change, and a
calculation that finds the generation moved on writes nothing — including, in
its `finally`, the one call that takes the loading overlay down. A model between
handles (what a re-running block produces on its way from one table to the next)
changes the settings but starts no calculation of its own, so it would supersede
the calculation in flight and leave nothing behind to clear the overlay.

Which options a settled calculation may write is still decided by the
generation. Taking the overlay down is now decided by whether any calculation is
still in flight, since the last one to settle is the one that knows nothing
further is coming. The between-handles path also no longer moves the generation
at all: it starts no work, so cancelling work is not its business.
