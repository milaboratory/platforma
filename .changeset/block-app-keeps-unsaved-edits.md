---
"@platforma-sdk/ui-vue": patch
---

A block window no longer drops an edit that is not saved yet. Until the first save of a window landed, every update from the server carried the previous author of the block's data, also an update that changed the outputs or the section only. The window took such an update for a change made elsewhere and put the server's data in place of its own, so an edit with its save still on the way was lost, and the next save wrote the block's data without it. The window's data is now replaced only when the stored data itself has changed.
