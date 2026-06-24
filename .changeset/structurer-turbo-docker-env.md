---
"@platforma-sdk/block-tools": patch
---

structurer: pass `PL_DOCKER_*` env vars through the `build` turbo task

The canonical root `turbo.json` only listed `PL_DOCKER_REGISTRY_PUSH_TO` in the
`build` task's `env`. Turbo 2.x runs in strict env mode, so `PL_DOCKER_BUILD` and
`PL_DOCKER_AUTOPUSH` (set by `build:dev-remote`) were stripped before `pl-pkg`
ran. The docker image build+push was silently skipped while the emitted software
descriptor still advertised a `docker.tag`, producing a green build whose image
was never pushed — the backend then failed to pull it (`NotFound`). It also meant
a failed `docker push` / login could never fail the build, because the push never
ran.

Widen the `env` glob to `PL_DOCKER_*` so the whole docker flow reaches `pl-pkg`.
`build:dev-remote` now actually builds and pushes, and a push/login failure
correctly fails the build (non-zero exit).
