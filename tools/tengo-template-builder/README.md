# Overview

This repo contains a tool, that facilitates integration of `tengo` libraries and template build and distribution process into npm infrastructure. 

# Example config & file layout

`package.json`

```json5
{
  // if your repo is a library or template collection, this sets its name in npm repo 
  "name": "@milaboratory/tengo-test-repo-1",
  // package version for publishing
  "version": "1.1.0",
  "description": "Test tengo pl template",
  "scripts": {
    // builds source files and puts compiled & normalized sources to ./dist folder
    "build": "pl-tengo-build"
  },
  "license": "UNLICENSED",
  // (see important comment about dependencies)
  "dependencies": {
  },
  "files": [
    "dist"
  ],
  // (see important comment about dependencies)
  "devDependencies": {
    // use latest version of tengo-template-builder package 
    "@milaboratory/tengo-template-builder": "1.0.1"
  }
}
```

Standard layout:

```
src
  library-1.lib.tengo
  library-2.lib.tengo
  template-1.tpl.tengo
  template-2.tpl.tengo
package.json
```

### Dependencies

Only if you are developing a library, and use external libraries or templates in your code add such dependencies
in `"dependencies"`, because your users will have to have those libraries as their transient dependencies. In all other
cases use `"devDependencies"`. For example use of `"devDependencies"` is recommended if you are consuming external
library code only in templates.
