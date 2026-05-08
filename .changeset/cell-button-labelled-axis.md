---
"@platforma-sdk/ui-vue": patch
"@milaboratories/uikit": patch
---

Fix `@cell-button-clicked` not firing on PlAgDataTableV2 when the configured axis has a label column. Since the predefined-label change in 1.75.0, labelled axes are replaced in the grid by their label column, so the cell-button cellRendererSelector — which only matched `type:"axis"` ColDefs — never installed. Now also resolve the axis on single-axis label columns whose labeled axis equals `showCellButtonForAxisId`.
