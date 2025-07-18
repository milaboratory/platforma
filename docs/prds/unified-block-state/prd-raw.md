# Abstract

In this upgrade to SDK we plan to introduce unified block state. In short block will have exactly one `state` taht is persisted, and the only persisted state that ui has access to modify. What currently are args will be derived using pure function lambda specified by a block developer in the model. Logic for args will be the same as it is now, but now there will be no direct access to write to args from UI, only change `state` so that `args` derivation function will produce new result.

State should be modeled on persistance level in way that will allow future adition of fields hiden from direct access by UI, making a room for future implementation of "plugins" - a mechanist that will allow completely abstract out thins like tables, graps, and free block developers from directly managing their state, and operate on a higher more "bioinformatician-friendly" level. In other words actual state should be `{ main: { /* block developer managed state*/ }, /* other parts of state managed by pluigins or other mechanisms */ }`

# Things to be impleented in this iterration

## Target Model API

```typescript
.withState<BlockState>({ /* constant initial state */ })
.args((state) => { /* code to derive args from state */ })
```

## Persistent schema

Implenetation of this transition will require to change the underlying persistance schema of the project (mutated by lib/node/pl-middle-layer/src/mutator/project.ts and additionally described in files referenced by mutator).

- remove `uiState`
- introduce new `state`
- `args` and `activeArgs`
```
```

# Aspects of future development that are important to plan for on on this iteration