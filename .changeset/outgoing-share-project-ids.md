---
"@milaboratories/pl-middle-layer": patch
---

Shares now carry an editable `title` (shown to recipients, defaults to the first project's name) in place of the free-text `message`. `MiddleLayer.changeShare(shareId, { recipients?, everyone?, title?, projectActions? })` replaces `renewShare`: it edits a share under its stable id, transfers already-decided recipients' accept/reject records, and can upgrade a targeted share to everyone. `projectActions` is a per-project decision keyed by projectId (`update` re-snapshots the live source, `keep` carries the existing snapshot, `remove` drops the project); omit it for the legacy auto behavior (live sources updated, deleted ones kept). `shareProjects` options now require `title` (and `replace` on the everyone variant). `OutgoingShare` exposes `{ title, projects: { projectId, label, updatedAt }[] }` and `PendingShare` exposes `title`; both drop `message`, and `PendingShare` drops `projectLabels`.
