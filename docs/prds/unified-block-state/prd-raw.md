# Abstract

In this upgrade to SDK we plan to introduce unified block state. In short block will have exactly one `state` taht is persisted, and the only persisted state that ui has access to modify. What currently are args will be derived using pure function lambda specified by a block developer in the model. Logic for args will be the same as it is now, but now there will be no direct access to write to args from UI, only change `state` so that `args` derivation function will produce new result.

State should be modeled on persistance level in way that will allow future adition of fields hiden from direct access by UI, making a room for future implementation of "plugins" - a mechanist that will allow completely abstract out thins like tables, graphs, and free block developers from directly managing their state, and operate on a higher more "bioinformatician-friendly" level. Another mechanism that should be baked into new schema in this iteration is state migration mechanism. In other words actual state should be something like:
```typescript
/** Any state that is meant to be migrated */
type VersionedState<S> = {
    v: number; // starts with 0
    s: S
};
/** A - is the state explicitly managed by block developer (the `state` described in this PRD) */
type NewState<A> = {
  main: VersionedState<A>,
  plugins: { /* state(s) managed by plugins, structure yet to be decided, but will most probably use VersionedState as well, because migrations are also needed there */},
  /* other parts of the state to be managed by other mechanisms */ }
```

# Things to be impleented in this iterration

## Reverse and forward compatibility requirements

- Blocks developed on new SDK must run on new SDK (obviously)
- Blocks developed with old SDK must also run on new SDK
- Persistant state of existing projects must me migrated on first load of new runtime, and is not supposed to be openable by old runtime (by old Desktop)
- Migration of the persistenmt state must be done in such a way that blocks that were added before to existing project will continue working with new runtime. In other words must be compatible with compatibility layer that will allow blocks developed with old SDK to to worked in new runtime
- New SDK, must be code compatible with old code developed with old SDK, yet clearly mark old API as deprecated
- This compatibility should facilitate gradual migration to new SDK.
- No need in making blocks developed on new SDK to run on old runtime (yet it can be done, by running the derivation lambda in UI on each write of the new `state`), thought if it turns out to be a significant time investment , i.e. > 2 hours, should not be pursued

## Target Model API

```typescript
.withState<BlockState>({ /* constant initial state */ })
.args((state) => { /* code to derive args from state */ })
```

## Persistent schema

Implenetation of this transition will require to change the underlying persistance schema of the project (mutated by lib/node/pl-middle-layer/src/mutator/project.ts and additionally described in files referenced by mutator from the lib/node/pl-middle-layer/src/model folder).

- remove `uiState`
- introduce new `state`
- `args` are more or less stays the same, theys are persisted into `prodArgs` on each change of state, by running the derivation lambda, (more or less how it is done now), args and activeArgs can still be read via the model

## Implicit state migration to new schema

State of blocks using old SDK must be somehow represented in new persistance schema, and implicit migration for the state executed when migrating the persistence schema must match this behaviour for everething to continue to work.

## Migration

For existing blocks we do the following migration:

```
newState = {
    uiState: uiStateFromPersistentSchemaV2,
    args: argsFromPersistentSchemaV2
}
```

In the absence of argsDerivation function (i.e. until requiresModelAPIVersion == 1), default behaviour is to extract args field and put a copy into the args.

# Implementation stages

## Stage 1

Implement all the low level logic, and implement SDK that will for now provide exactly the same API in terms of code, but will be able to use new SDK-only API. We'll have to implement many things, but the thing is that overall focus is in achieving the same code-compatible SDK both in model and in the UI.
