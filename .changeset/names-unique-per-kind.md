---
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pl-middle-layer": minor
---

Names are unique per kind inside a folder: a folder, a project and a template beside each other may share a name, while two folders, two projects or two templates still may not. `foldersSiblingNames` takes the kind, the `duplicate-name` violation names it, and a refused name says which kind already carries it (`A folder named "X" is already here.`).
