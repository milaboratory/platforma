---
"@milaboratories/pl-drivers": minor
---

`UploadDriver.adopt(snapshot, owner)` keeps an upload going on behalf of an owner whether or not anybody reads its progress, until `releaseOwner(owner)` or driver termination, which now also stops running uploads. Adopting an upload whose blob is already set, or one signed on another machine, queues nothing; an upload that failed for good stays registered and is not retried by adopting it again. `nConcurrentUploads` (default 2) sets how many files upload at once, and progress handed to readers is a copy rather than the object the driver keeps updating.
