---
"@milaboratories/pl-config": major
"@milaboratories/pl-deployments": major
---

The local (Desktop App built-in) backend is configured with command-line options instead of a generated YAML file, using the same options as the LocalFS CI tests. `generateLocalPlConfigs` returns `plArgs` instead of `plConfigContent`, and takes `extraArgs` instead of `plConfigPostprocessing`; `localPlatformaInit` takes `args` instead of `config`. The storages keep their IDs (`main`, `work`, `root`), so projects of an existing local installation keep working. The license and the master secret are passed as files, and extended logging, which wrote command environments (the license included) to platforma.log, is no longer enabled. Requires a backend with `--host-data-library-id`, `--host-data-library-downloadable` and `--primary-storage-fs-local-access`.
