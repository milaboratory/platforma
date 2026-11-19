# Overview

This repo contains a tool, that facilitates integration of `tengo` libraries and template build and distribution process into npm infrastructure.

# Commands

The package installs one binary, `pl-tengo`.

| Command                                              | What it does                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `pl-tengo build`                                     | Builds the sources in `./src` into a distributable pack in `./dist`.       |
| `pl-tengo check [paths...]`                          | Checks the sources with the tengo language processor. Defaults to `./src`. |
| `pl-tengo test [paths...]`                           | Runs the tengo tests. Defaults to `./src`.                                 |
| `pl-tengo imports [paths...]`                        | Finds the imports the sources do not use. Defaults to `./src`.             |
| `pl-tengo dump artifacts` / `pl-tengo dump software` | Prints the parsed artifacts or software descriptors.                       |

## `pl-tengo imports`

An import is used when its alias appears with a dot somewhere else in the code:
`text.split(...)`. Comments do not count as usage, so an alias that is left only
in a comment is reported.

| Mode      | What it does                                                         |
| --------- | -------------------------------------------------------------------- |
| `--check` | Reports the unused imports and exits with an error. Changes no file. |
| `--fix`   | Removes the unused imports from the sources.                         |
| no option | `--fix`, or `--check` when the `CI` environment variable is set.     |

The default keeps CI honest: a person who builds gets the sources cleaned, while
CI reports the problem instead of making a change nobody reviewed.

A source the parser cannot read is reported and kept as it is. The other
sources are still cleaned, and the command exits with an error.

<!--
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
library code only in templates. -->
