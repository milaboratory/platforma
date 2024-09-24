# Usage examples

```bash
pl-pkg build [ --dev=local ] # build all available targets
pl-pkg build [ --dev=local ] descriptors [ binary | docker | ... ] # build only sw.json file
pl-pkg build [ --dev=local ] packages # pack .tgz archive
pl-pkg build [ --dev=local ] docker # build docker image
pl-pkg build [ --dev=local ] ...

pl-pkg get package path # get path to package archive to be built/published
pl-pkg get package name # get name of the binary package as would be provided by registry
pl-pkg get package version # get the version of package to be built/published

pl-pkg publish # publish everything that can be published
pl-pkg publish descriptors # publish software descriptor
pl-pkg publish packages # publish software package to registry
```
