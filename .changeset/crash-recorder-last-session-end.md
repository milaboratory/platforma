---
"@milaboratories/pl-crash-recorder": patch
---

Fix crash detection for a session file that several recorders share. A session now counts as clean only when the last line of its file is a `session-end` record. The check and `readSession` ignore NUL bytes that a power loss can leave on ext4 or NTFS. Add `endSession(dir, sessionId, reason, options)` to end an open session from outside the recorder. Its header has the role `main` when the caller gives no role. A recorder that opens a log with a cut-off last line writes a newline first, so the cut-off line cannot hide the next header. A new recorder or recording session on a file closes the old one in the same thread first, with reason `superseded`. A leaked session then cannot keep a second writer and sampler on the file.
