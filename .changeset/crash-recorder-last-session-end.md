---
"@milaboratories/pl-crash-recorder": patch
---

Fix crash detection for a session file that several recorders share. A session now counts as clean only when the last line of its file is a `session-end` record. The check and `readSession` ignore NUL bytes that a power loss can leave on ext4 or NTFS. Add `endSession(dir, sessionId, reason, options)` to end an open session from outside the recorder.
