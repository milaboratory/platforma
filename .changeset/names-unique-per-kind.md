---
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

Names are unique per kind inside a folder: a folder, a project and a template beside each other may share a name, while two folders, two projects or two templates still may not. `foldersSiblingNames` takes an optional `{ kind }` to list the names of one kind only (without it, it lists every kind, as before), the `duplicate-name` violation names the kind, and a refused name says which kind already carries it (`A folder named "X" is already here.`).
