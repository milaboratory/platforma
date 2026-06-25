---
"@platforma-sdk/package-builder": patch
---

Migrate the pl-pkg CLI framework from oclif to commander. Internal change only — the full command surface (`build`, `build docker|packages`, `prepublish`, `publish all|docker|packages`), all flags, env-var bindings, defaults, and exit behavior are preserved.
