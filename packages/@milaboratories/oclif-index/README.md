# Usage examples

```bash
oclif-index --help # write help about all available options

oclif-index # indexes all .ts files in ./src/commands/ and builds ./index.ts file
oclif-index --commands-root=./src/cmds/ # indexes all .ts files in ./src/cmds/ dir
oclif-index --source-extension='./js' # indexes all .js files in ./src/commands dir
oclif-index --index-file='commands.ts' # writes the code into custom index file instead of './index.ts'
```
