---
"@platforma-sdk/ui-vue": patch
---

Follow-ups from review of the `PlAgDataTableV2` reload fixes.

An explicitly cleared stored state is an opinion, not silence. Absent and empty
mean the same thing coming *from* AG Grid, which omits what carries no
information, but in the stored state an empty list is the user having cleared the
sorting or shown every column — and the grid has to be made to match it.
Normalizing both sides alike meant such a state was read as "nothing to ask for"
and left the grid stale.

A change of data source now moves the generation even when the new model has no
handles yet. That path starts no calculation, which is why it stopped moving the
generation — but the calculation in flight belongs to the source being left, and
must not be allowed to install its columns and datasource under the new one.

Taking the loading overlay down belongs to the current generation again, rather
than to whichever calculation settles last. A superseded calculation could
otherwise hide an overlay the newer settings had just put up — the "no data
source" branch raises one and starts no calculation of its own — leaving an empty
table saying nothing about why. The case that motivated the counter is covered by
the generation no longer moving on a same-source recomputation.
