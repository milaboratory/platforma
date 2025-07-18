# Current Block State API in Platforma

*Document Date: July 18, 2025*  
*Package Versions:*
- `@platforma-sdk/model`: 1.40.5
- `@platforma-sdk/ui-vue`: 1.40.5
- `@milaboratories/pl-middle-layer`: 1.39.17

## Overview

The Platforma block state system is designed to manage the state and execution of computational blocks within the platform. Each block represents a unit of computation that can process data, produce outputs, and maintain persistent state. The state management is split into two primary components that serve distinct purposes in the block lifecycle.

## Core State Components

### 1. Args (Arguments)

The `args` component represents the primary input parameters for a block's computational workflow. This is:

- **A persistent JSON object** stored in the project resource (one per block)
- **Sent to backend workflows** for both staging (pre-run) and production executions
- **Primary source for dependency tracking** through PlRef objects
- **Immutable during computation** - changes trigger re-computation
- **Accessible in model lambdas** for output computations and validation

Key characteristics:
- Stored in the `currentArgs` field in the project structure
- Changes to args reset all downstream block stagings
- Used to determine if production results are stale (by comparing `currentArgs` vs `prodArgs`)
- Must be JSON-serializable
- Can contain PlRef objects that establish block-to-block dependencies

### 2. UiState

The `uiState` component represents UI-specific persistent state that:

- **Persists across sessions** but is not sent to backend computations
- **Can be accessed in model lambdas** for output rendering
- **Stores UI preferences** like table configurations, view states, filters
- **Does not affect computation staleness** - changes don't trigger re-computation

Key characteristics:
- Stored in the `uiState` field in the project structure
- Can be undefined/null initially
- Typically contains view configurations (e.g., `PlDataTableState`)
- Changes don't affect the dependency graph or computation status

## Initial State Definition

**Important**: Initial values for both `args` and `uiState` must be defined as constants in the block model. They cannot be dynamically derived or computed:

```typescript
.withArgs<BlockArgs>({ 
  // Initial args must be constant values
  species: "",
  chains: ["IGH"],
  chainConfigs: {},
})
.withUiState<UiState>({
  // Initial UI state must be constant values
  tableState: createPlDataTableStateV2(),
})
```

## State Persistence and Storage

Both state components are persisted in the Platforma resource system as JSON objects. The system handles serialization and storage automatically, ensuring data consistency across sessions.

## State Access Patterns

### In the Model (Configuration)

The block model definition (as seen in `platforma/sdk/model/src/builder.ts`) provides methods to define:

1. **Initial state values** (must be constants):
   ```typescript
   .withArgs<BlockArgs>({ /* constant initial args */ })
   .withUiState<UiState>({ /* constant initial UI state */ })
   ```

2. **State validation**:
   ```typescript
   .argsValid((ctx) => /* validation logic */)
   ```
   
   The `argsValid` function serves a crucial UI purpose: it determines when the block's "Run" button should be active. When this function returns `true` (and all upstream dependencies are also valid), the UI enables the run button, allowing users to trigger production execution.

3. **Output computations** that can access both states:
   ```typescript
   .output('someOutput', (ctx) => {
     // Access current args via ctx.args
     // Access current uiState via ctx.uiState
     // Access production args via ctx.activeArgs
   })
   ```

### In the UI Layer

The UI modifies state through a high-level reactive API. Vue components interact with state through the reactive `app.model` object:

```typescript
// High-level reactive access (what UI developers use)
app.model.args.someProperty = newValue;  // Reactive assignment
app.model.ui.tableState = newTableState;  // Reactive assignment

// The SDK automatically handles the low-level calls:
// setBlockArgs(args);
// setBlockUiState(ui);
// setBlockArgsAndUiState(args, ui);
```

The reactive model provides:
- Automatic change detection
- Debounced updates to prevent excessive saves
- Type-safe access to state properties
- Seamless integration with Vue's reactivity system

### In Backend Workflows

Backend workflows receive args directly as JSON when execution begins. The workflow system:
- Receives the args JSON object as input
- Uses args to configure computational parameters
- Resolves PlRef dependencies to access upstream data
- Determines resource requirements based on args

Note: UiState is never sent to workflows as it contains only UI-specific information.

## Dependency Management

### PlRef System

PlRefs (Platform References) are the cornerstone of the dependency system:

```typescript
// From platforma/lib/model/common/src/ref.ts
export const PlRef = z.object({
  __isRef: z.literal(true), // Crucial marker for dependency tree reconstruction
  blockId: z.string(),      // Upstream block id
  name: z.string(),         // Output name
  requireEnrichments: z.literal(true).optional()
});
```

PlRefs embedded in args are automatically detected and used to:
1. **Build dependency graphs** between blocks
2. **Determine execution order** for production runs
3. **Track which blocks need re-computation** when upstreams change
4. **Enable data flow** between blocks through the result pool

### Graph Construction

The system constructs two types of dependency graphs:

1. **Staging Graph**: Simple linear dependencies based on block order
2. **Production Graph**: Complex dependencies based on PlRef analysis in args

From `platforma/lib/node/pl-middle-layer/src/model/project_model_util.ts`:
- Graphs track direct and transitive dependencies
- Support enrichment patterns where blocks can enhance upstream outputs
- Enable efficient change propagation

## Execution Contexts

### Staging (Pre-run)

Staging is a lightweight execution mode that:
- **Runs automatically** when args change
- **Provides quick feedback** for UI updates
- **Uses simplified dependency model** (linear progression)
- **Rate-limited execution** (configurable blocks per second)
- **Cached results** available as `stagingOutput`, `stagingCtx`, `stagingUiCtx`

### Production

Production is the full execution mode that:
- **Requires explicit user action** (clicking "Run" when `argsValid` returns true)
- **Executes on backend infrastructure** with full resources
- **Respects complex dependencies** from PlRefs
- **Produces final results** for downstream consumption
- **Maintains state fields**: `prodArgs`, `prodOutput`, `prodCtx`, `prodUiCtx`

### State Transitions

Blocks can be in several states:
1. **Not rendered**: No staging or production outputs exist
2. **Staging only**: Quick preview available, no production run
3. **Stale production**: Production exists but args have changed
4. **Fresh production**: Production matches current args
5. **Limbo**: Production results kept despite upstream changes
6. **Running**: Currently executing (staging or production)

## Context and Result Pool

The execution context (`resultPool` in models) provides access to:
- **Upstream block outputs** via PlRef resolution
- **Block metadata** and specifications
- **Cross-block data sharing** through the result pool
- **Lazy loading** of dependencies

Example from `mixcr-clonotyping-2/model/src/index.ts`:
```typescript
.output('datasetSpec', (ctx) => {
  if (ctx.args.inputLibrary) 
    return ctx.resultPool.getSpecByRef(ctx.args.inputLibrary);
  else 
    return undefined;
})
```

## State Update Flow

1. **UI modifies reactive model** → `app.model.args.property = value`
2. **SDK detects changes** → debounced state updates triggered
3. **Middle layer persists** → args/uiState written to resources
4. **Change detection** → downstream blocks marked for re-computation
5. **Staging refresh** → automatic lightweight re-computation
6. **User triggers production** → full computation with dependency resolution
7. **Results propagate** → downstream blocks can access new outputs

## Author Tracking

The system tracks authorship of changes for collaborative editing:
- Author markers stored with state changes
- Enables conflict resolution in multi-user scenarios
- Tracked at the block level for args modifications
## Performance Optimizations

1. **Lazy state loading** (PR #883): Args and uiState loaded on-demand in lambdas
2. **Computable cleanup** (PR #849): Deleted blocks have computables cleared
3. **Rate-limited staging**: Prevents overwhelming the system with updates
4. **Previous state caching**: Quick rollback and comparison capabilities
5. **Reactive model batching**: Vue's reactivity system batches multiple changes

## Current Limitations

1. **No unified state object**: Args and uiState are separate concerns
2. **Limited workflow access**: Only args reach backend computations
3. **Fixed state structure**: Cannot dynamically extend state components
4. **Static initial values**: Initial args and uiState must be constants
5. **No partial state updates**: Full object replacement required
6. **No custom state partitions**: Limited to args/uiState dichotomy

## Implementation References

Key files for understanding the implementation:
- `platforma/sdk/model/src/builder.ts` - Block model definition API
- `platforma/lib/node/pl-middle-layer/src/mutator/project.ts` - State persistence
- `platforma/lib/node/pl-middle-layer/src/middle_layer/block.ts` - State retrieval
- `platforma/lib/model/common/src/block_state.ts` - Type definitions
- `platforma/sdk/ui-vue/src/internal/createApp.ts` - UI state management
- `platforma/lib/node/pl-middle-layer/src/model/project_model_util.ts` - Dependency graphs
