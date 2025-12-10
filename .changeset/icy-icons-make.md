---
'@platforma-sdk/tengo-builder': minor
---

Tengo-builder now detects imports even when they are in multiline statements.
It also checks code for import-like statements and produces errors to show user that the code would not work as expected,
i.e.:
  assets.
    importSoftware("a:b") // works now

  assets.importSoftware(myAssetIdVariable) // does not work, produces an error now
