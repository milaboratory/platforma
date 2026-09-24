---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

Folders: projects and templates can be arranged in a tree

**The document.** One user's folder tree is one JSON document at schema version 1: the folders,
each with a name, an optional parent and an optional description, plus two maps — `assignments`
from a project to the folder holding it, and `templateAssignments` from a template to its folder.
An item neither map mentions is at the top level. The document lives in a `Folders` singleton of
its own on the user's client root (`FoldersField`, `FoldersResourceType`), created by the middle
layer's init; nothing is added to the projects resource. Every write mints a new immutable value
and re-points the singleton's one field.

**The healing read.** `decodeStoredFoldersDocument` turns what is stored into a `FoldersDecoded`.
No document means no folders, and writable. A document written by a newer build, or one that
cannot be read as schema version 1, reads as no folders with `writable: false` and a `problem`, so
a build that does not understand a tree never overwrites it with its own truncated view.

`healFolders` resolves the decoded document against the project and template lists into a
`FoldersView`. The read heals and never fails: an item the document does not mention is at the
top level, an assignment naming an item that is gone is ignored, and a folder whose parent is
missing, or which sits in a cycle, is lifted to the top level and flagged `lifted`. No input can
make a project or a template disappear. `validateFoldersDocument` is the write path's
counterpart: a write that would persist a broken document — a cycle, a missing parent, a blank
folder name, two items of one name in one parent — is refused.

`MiddleLayer.folders` publishes a `FoldersListing`: the folders, every project
(`FoldersProjectEntry`) and every template (`FoldersTemplateEntry`), each with its `folder`,
`ancestors` and `path`. The folder tree, the project list and the template list are read in one
computable, and nothing is published while any of them is still syncing, so an item is never
shown at the top level first and then moved into its folder.

**One namespace per parent.** Folders, projects and templates inside one parent share one
namespace, and names are compared ignoring case and surrounding whitespace (`foldersNameTaken`).
A name a person typed is refused when it is taken, with `"X" is already used here.`; a name the
middle layer chose is suffixed instead — `X (Copy)`, `X (Copy 2)` (`foldersUniqueName`). Names
already stored are never rewritten: a collision an account already holds is tolerated, and either
side of it can still be renamed. While the folder document cannot be read, project and template
renames are not checked, since treating every item as top-level would turn the per-parent rule
into a global one.

**Folder operations.** `MiddleLayer` gains `createFolder`, `renameFolder`,
`setFolderDescription`, `previewFoldersMove`, `moveFolderItems`, `previewFolderDeletion`,
`deleteFolder` and `duplicateFolder`. `createProject` and `createProjectFromTemplate` take the
folder the new project lands in. A folder name is stored trimmed, and a blank one is refused.

**Reset.** `MiddleLayer.resetFolders` replaces a folder document this build cannot read, newer or
unreadable, with an empty one, leaving every project and template at the top level; it is refused
while the document reads fine.

**Move: preview, then confirm.** A move takes any mix of folders, projects and templates into one
destination. `planFoldersMove` produces the plan the preview shows — every item and the name it
ends up with, templates included — and `moveFolderItems` recomputes it inside the write
transaction. `commitFoldersMove` commits only when the recomputed plan equals the confirmed one
(`foldersMovePlansEqual`); otherwise nothing is written and the `FoldersMoveOutcome` is
`plan-changed`, carrying the fresh plan to confirm again. A move that renames something needs a
confirmed plan (`needs-confirmation`), and a move that cannot be planned reports `cannot-plan`
with its `FoldersMoveIssue`s. A folder moves with everything inside it, and an item selected
together with a folder that holds it travels with that folder.

**Recursive delete, always confirmed.** Deleting a folder destroys it, every folder beneath it,
and every project and template held anywhere in that subtree, in one transaction.
`planFoldersRemoval` returns the `FoldersRemoval` naming exactly what goes. A deletion cannot be
undone, so `deleteFolder` requires that removal back as `confirmedRemoval` however little it
destroys, and `commitFoldersRemoval` refuses it as `plan-changed` when the subtree has changed
since: a project dropped into the folder after the dialog opened aborts the deletion rather than
being destroyed unseen.

**No depth limit.** Folders nest to any depth. A cycle is refused by the write path and cut by
the read.

**Placement follows the source.** A duplicate of a project, and a template saved from one, land in
the folder holding their source, placed in the transaction that creates them (`inheritedFolder`).
`duplicateFolder` copies a whole subtree beside its source, under `X (Copy)`.

**Descriptions.** Projects, templates and folders carry free text beside their name:
`ProjectMeta.description`, `TemplateListEntry.description` (written by
`MiddleLayer.setTemplateDescription`) and `FolderEntry.description` (written by
`MiddleLayer.setFolderDescription`). A description is stored trimmed (`normalizeDescription`);
blank clears it, and nothing is stored for a thing nobody described. A duplicate, a snapshot taken
for a share and a copy taken out of one all carry the source's description.
`saveProjectAsTemplate` takes the new template's description after its label; without one the
template is stored undescribed.

`TemplateId` moves to `@milaboratories/pl-model-common`, beside `ProjectId`, so the model package
can name what it places. `@milaboratories/pl-middle-layer` still exports it. `asProjectId`,
`asTemplateId` and `asFolderId` brand a string already known to be such an id, such as one a caller
hands back.

The template list skips, rather than throws on, an entry that is not a fully synced template, the
way the project list does, so one such entry no longer takes the whole list down.

**Visible changes to released API:**

- `setProjectMeta` takes a patch (`Partial<ProjectMeta>`) and leaves the fields it is not given as
  they are, so a rename can no longer revert a description written in between.
- `setProjectMeta` and `renameTemplate` throw when the new name is already used by something else
  in the same parent, compared ignoring case and surrounding whitespace: renaming a project to
  `SAMPLES` beside a `Samples` is refused, while the same name in two different folders is fine.
  The check runs in the rename's own transaction, so two renames racing for one name cannot both
  win.
- `setProjectMeta`, `renameTemplate` and `saveProjectAsTemplate` store the name trimmed.
- `saveProjectAsTemplate` without a label names the template to be free beside its source project
  (`X (Copy)` for a project `X`), and throws when a label it is given is already used there.
- `duplicateProject` without `rename` names the copy beside its source, `X (Copy)`, where it used
  to reuse the source's label. A label returned by `rename` is kept as it is; when it is taken
  beside the source, the copy lands at the top level.
- The "not found" errors read `Project X not found in the project list.` and
  `Template X not found in the template list.`
