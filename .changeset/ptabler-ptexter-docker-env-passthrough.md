---
"@platforma-open/milaboratories.software-ptabler": patch
"@platforma-open/milaboratories.software-ptexter": patch
"@platforma-sdk/block-tools": patch
---

Fix software `build`: pass the docker-control knobs (`PL_DOCKER_BUILD`,
`PL_DOCKER_NO_BUILD`, `PL_DOCKER_AUTOPUSH`, `PL_DOCKER_NO_AUTOPUSH`,
`PL_DOCKER_REGISTRY_PUSH_TO`) through the `build`/`do-pack` tasks of the ptabler
and ptexter `turbo.json`, and add the build/autopush toggles to the structurer's
root `turbo.json` template so generated block repos inherit them too. When these
packages moved from `pl-pkg build` to `block-tools software build`, their
package-level `turbo.json` overrode the root task's `passThroughEnv` with only
`AWS_*`/`PL_AWS_*`, so under turbo strict env mode the docker knobs were stripped.
Consumers building the monorepo in CI (e.g. the `pl` monorepo test job) then had
no way to disable the docker build or redirect the push, and `block-tools software
build` fell back to its CI default of pushing to the public
`containers.pl-open.science` registry — failing with `unauthorized` on runners
without push credentials.
