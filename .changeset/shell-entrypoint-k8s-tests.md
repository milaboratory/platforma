---
"@platforma-open/milaboratories.software-ptabler": patch
"@platforma-open/milaboratories.software-ptexter": patch
---

Let the docker build flags reach the build.

Both packages define their own `turbo.json`, and a task's `passThroughEnv` replaces the root list rather than extending it. Theirs named only `AWS_*` and `PL_AWS_*`, so `PL_DOCKER_NO_BUILD` and its siblings were stripped before the build ran and the CI defaults applied instead: build the image and push it.
