---
"@milaboratories/pl-client": patch
---

Support backends before security layer implementation.

Before the update, pl client required resource signatures to be not empty in any conversion
from string to SignedResourceId.

This is impossible to meet when connected to older backend (i.e. 1.45.3) that have no code
of our modern security layer.
