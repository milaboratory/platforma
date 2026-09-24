---
"@milaboratories/pl-drivers": patch
---

Keep an import pending for up to 5 minutes when the backend reports NOT_FOUND before the first progress status, then mark it done with an error.
