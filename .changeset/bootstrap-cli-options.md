---
"@platforma-sdk/bootstrap": major
---

`pl-dev` starts a local backend (`start local`, `start local s3`, `svc create local`, `svc create local s3`) with command-line options instead of a generated `config.yaml`, as the backend no longer reads a YAML config. The `--config <path>` option is removed. Storage IDs (`main`, `work`, `library`) stay as before, so existing instances keep their data. The backend always requires authentication now: the instance uses the `users.htpasswd` file (or the LDAP server) as before, with a master secret generated once into `<storage>/master-secret`. A license passed as a value is written to `<storage>/license` and passed as a file. Requires a backend with `--primary-storage-id` and `--work-storage-id`.
