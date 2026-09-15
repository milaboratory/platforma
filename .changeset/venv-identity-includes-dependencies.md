---
"@platforma-sdk/workflow-tengo": patch
---

Save python dependency specs into the run environment so its identity reflects them

A python run environment was saved holding only the bare venv, and its dependencies were installed
afterwards. Its content hash was therefore a function of the interpreter alone, so two environments
built from one interpreter were indistinguishable and deduplication handed every software whichever
was registered first — a script could run under another package's venv and fail to import a
dependency it declares.

The dependency files are now written into the environment before it is saved, as conda already does
with `env-spec.yaml` and R with `renv.lock`.
