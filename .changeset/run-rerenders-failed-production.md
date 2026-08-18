---
"@milaboratories/pl-middle-layer": patch
---

Make Run re-render a block whose production failed outright.

The Run button is enabled whenever a block's production carries an error, but the mutator recognised only one of the two shapes such a failure takes. `productionHasErrors` read the field's `status`, which is derived from the resource the field points at — so it saw a value resource that exists and carries an error, and missed a field whose own error slot is filled and that therefore has no value resource at all. In that second shape `renderProduction` found nothing to re-render for the block and committed an empty transaction: the button was live, the click was accepted, and the block never re-ran.

Field-level errors are now carried through `ProjectMutator.load` alongside the value reference and counted by `productionHasErrors`, so both shapes reach `requireProductionRendering` and the enable condition the desktop uses for the button once again matches the condition the mutator renders on.
