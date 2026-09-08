---
"@milaboratories/pl-middle-layer": minor
---

A stored template is shared without inspecting its document. `shareTemplate` no longer refuses a template holding a block installed from a local folder and returns `{ shareId }`; `checkTemplateShareable` and `unshareableTemplateEntries` are gone. An entry the recipient cannot resolve is reported to them where they preview or apply the template.
