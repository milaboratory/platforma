# Test must expose all the helpers for testing in the least possible number of vars

```typescript
blockTest(
  'simple project',
  async ({ project, pl }) => {

  })
```

- pl is a universal entry point for things done in tests

# Each block during build process must export a self-contained constant that can be used to add a block

- name of the export must be generated from the package name (for simplified autocompletion and automated imports)
- using the constant will right away set all the types and all the things taht can be done with the block

```typescript
import { SamplesAndData } from '@platforma-open/milaboratories.samples-and-data';
const snd = await project.addBlock(SamplesAndData);
```

# Object returned by addBlock is a smart object

```typescript
// ...
snd.setArgs({ ... }) // type safe setter for args (and uiState)
// ...
await snd.run({ /* optional(!) timeout */ }) // run and awaits completion, and await all outputs to become stable
// for unusual scenarious there are options like
await snd.run({ awaitCompletion: false })
// ...
snd.ref(exportName) // can be used to set reference on this block in other blocks (exportName from the workflow)
// there are options like requireEnrichments: true (read the code for the meaning)
// ...
// this smart object can be used to get outputs (those outputs returned by the model)
snd.outputs.outputFromModel // throws if error
// each output provides a proxy to work with the output, or, it's sub-fields
snd.outputs.outputFromModelContainingPTable.theFieldWithPTableHandle // returns raw handle
await pl(snd.outputs.outputFromModelContainingPTable.theFieldWithPTableHandle).numberOfRecords()
await pl(snd.outputs.outputWithFileHandle).readFileAsJson()
```

- those smart objects returned by pl are actually implemented in one place, but corresponding class implements many interfaces with matchers and helpers that are value-type-specific. The interface of pexpect have many overloads, so returned interface is narrowed to actual type like PTable.
- there must be a separate document in this PRD folder about `pl` listing all those helper methods, with specific types they are aplicable to, and other things explained below

# Smarted builders for specific blocks

- some of the blocks may provide helper / builder methods
- this must be set in the model, like a lambda that should return an instance of a extended class of normal smart builder with all the required bells and whistles

```typescript
// ...
const ds1 = snd.addR12Dataset()
const { sampleId: sample1Id } = ds1.addLocalFiles({ r1: "path_to_local_file", r2: "..." })

// ...

// if need to add file for the same sample
const ds2 = snd.addR12Dataset()
ds1.addLocalFiles({ r1: "path_to_local_file_2", r2: "...", sampleId: sample1Id })
```

- implementations of those builders / helpers also receive an instance of our universal `pl`

# Universal `pl`

- pl also allows to instantiate things like import file handles (local or from library); read the codebase to understand what it is, and why and where they are needed

# Test Assets

- Test framework must be compatile (and even specifically optimizaed) to work with asset functionality explained in 
