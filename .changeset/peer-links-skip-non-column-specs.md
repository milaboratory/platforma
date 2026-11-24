---
"@platforma-sdk/model": patch
---

`collectDatasetAxes` skips result-pool objects that are not columns. A block upstream that exported a file, such as MiXCR Clonotyping with a custom library, made `deriveColumnOptions`, `deriveRecipeOptions` and table link hints throw "cannot read property of undefined".
