---
"@milaboratories/pl-middle-layer": patch
---

Make block edits and block opening faster in large projects.

- Keep the block model bundle evaluated in a VM for lifecycle callbacks (args derivation, storage updates, migrations). Before, each call parsed and compiled the whole bundle again.
- The block state no longer embeds the project overview. Before, each open block view kept its own copy of the overview, so opening a block rendered the section and title lambdas of every block in the project.
