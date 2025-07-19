# Current Block State API in Platforma

*Document Date: July 18, 2025*  
*Package Versions:*
- `@platforma-sdk/model`: 1.40.5
- `@platforma-sdk/ui-vue`: 1.40.5
- `@milaboratories/pl-middle-layer`: 1.39.17

## Overview

The Platforma block state system is designed to manage the state and execution of computational blocks within the platform. Each block represents a unit of computation that can process data, produce outputs, and maintain persistent state. The state management consists of four key components that serve distinct purposes in the block lifecycle:

1. **Args** - Persistent computational parameters that drive workflow execution
2. **UiState** - Persistent UI-specific state for user interface preferences  
3. **Navigation State** - Session-specific routing state for section navigation
4. **Sections** - Dynamic UI structure definition for the left overview panel

## Core State Components

### 1. Args (Arguments)

The `args` component represents the primary input parameters for a block's computational workflow. This is:

- **A persistent JSON object** stored in the project resource (one per block)
- **Used for staging computations** - staging always uses the current `args`
- **Primary source for dependency tracking** through PlRef objects
- **Immutable during computation** - changes trigger re-computation
- **Accessible in model lambdas** for output computations and validation

Key characteristics:
- Current args stored in the `prodArgs` field in the persisted project structure
- Production args snapshot stored in the `currentArgs` field (captured when user hits "Run")
- Changes to args reset all downstream block stagings
- Block is in **stale mode** when `prodArgs` differs from `currentArgs`
- Can contain PlRef objects that establish block-to-block dependencies
- Both `prodArgs` and `currentArgs` can be accessed in model lambdas (named `args` and `activeArgs` correspondingly)

### 2. UiState

The `uiState` component represents UI-specific persistent state that:

- **Persists across sessions** but is not sent to backend computations
- **Can be accessed in model lambdas** for output rendering
- **Stores UI preferences** like table configurations, view states, filters
- **Does not affect computation staleness** - changes don't trigger re-computation

Key characteristics:
- Stored in the `uiState` field in the project structure
- Typically contains things like view configurations (e.g., `PlDataTableState`)
- Changes don't affect the dependency graph or computation status

## Additional State Components

### 3. Navigation State

Navigation state manages the current active section within a block's UI. Unlike `args` and `uiState`, navigation state has unique characteristics:

**Key Characteristics:**
- **Not persisted across sessions** - exists only in memory during runtime
- **Session-specific** - each independent observer maintains their own navigation state
- **Defaults to root** - initializes with `{ href: '/' }`
- **Routing mechanism** - determines which UI component is currently displayed
- **Real-time communication** - communicated to desktop in two places:
  - Project overview (for left panel display)
  - Block state (for UI routing)

**Technical Implementation:**
```typescript
type NavigationState<Href extends `/${string}` = `/${string}`> = {
  readonly href: Href;
};
```

Navigation state is managed by the `NavigationStates` class in the middle layer:
- Stored in-memory using a `Map<string, NavigationStateEntry>`
- Uses `ChangeSource` for reactive updates
- Deleted blocks have their navigation state cleaned up
- Each block defaults to `DefaultNavigationState = { href: '/' }`

**Usage in UI:**
```typescript
// Navigate to a section
app.navigateTo('/section-name');

// Update navigation state with callback
app.updateNavigationState((nav) => {
  nav.href = '/new-section';
});

// Access current navigation
const currentHref = app.href;  // computed from navigationState.href
const queryParams = app.queryParams;  // parsed query parameters
```

**Multi-User Implications:**
Since navigation state is not persisted, multiple users viewing the same project will each maintain their own independent navigation state. This allows each user to navigate through different sections without affecting others' views.

### 4. Sections

Sections define the navigational structure displayed in the left overview panel and determine what UI routes are available within a block. They are dynamically generated based on the current state.

**Section Types:**
```typescript
type BlockSection = BlockSectionLink | BlockSectionDelimiter;

type BlockSectionLink = {
  type: 'link';
  href: `/${string}`;           // Route path
  label: string;               // Display text
  appearance?: 'add-section';  // Special styling
};

type BlockSectionDelimiter = {
  type: 'delimiter';           // Horizontal separator
};
```

**Dynamic Section Generation:**
Sections are defined using the `.sections()` method in the block model, which can access both `args` and `uiState`:

```typescript
.sections((ctx) => {
  const dynamicSections = (ctx.uiState.dynamicSections ?? []).map((section) => ({
    type: 'link' as const,
    href: `/section?id=${section.id}` as const,
    label: section.label,
  }));
  
  return [
    { type: 'link', href: '/', label: 'Main' },
    { type: 'link', href: '/settings', label: 'Settings' },
    ...dynamicSections,
    { type: 'delimiter' },
    { type: 'link', href: '/add-section', appearance: 'add-section', label: 'New Section' },
  ];
})
```

**Section Lifecycle:**
1. **Model evaluation** - Sections lambda is executed during block overview computation
2. **Left panel rendering** - Desktop displays sections in the project overview
3. **Navigation handling** - User clicks trigger navigation state updates
4. **Route resolution** - UI matches current `navigationState.href` to display appropriate component
5. **Re-evaluation** - Changes to args/uiState trigger section list updates

**Integration with Navigation:**
- Sections define available routes (`href` values)
- Navigation state tracks current active route
- UI uses `app.getRoute(href)` to resolve current component
- Route matching enables type-safe navigation with query parameters

**Example Implementation:**
```typescript
// In model/src/index.ts
.sections((ctx) => {
  if (ctx.args.enableAdvanced) {
    return [
      { type: 'link', href: '/', label: 'Basic View' },
      { type: 'link', href: '/advanced', label: 'Advanced Settings' },
    ];
  }
  return [{ type: 'link', href: '/', label: 'Main' }];
})

// In ui/src/app.ts
routes: {
  '/': () => MainPage,
  '/advanced': () => AdvancedPage,
}
```

## Initial State Definition

**Important**: Initial values for both `args` and `uiState` must be defined as constants in the block model. They cannot be dynamically derived or computed.

The `withArgs()` and `withUiState()` methods serve two critical purposes:
1. **Set initial state values** - providing default values for the block
2. **Set TypeScript types** - these types are propagated throughout both the model and UI layers

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

The type information defined here becomes available across the entire block ecosystem, ensuring type safety in model lambdas, UI components, and state management operations.

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

3. **Dynamic sections configuration**:
   ```typescript
   .sections((ctx) => {
     // Access current args and uiState to generate sections dynamically
     const sections = [{ type: 'link', href: '/', label: 'Main' }];
     
     if (ctx.args.showAdvanced) {
       sections.push({ type: 'link', href: '/advanced', label: 'Advanced' });
     }
     
     // Add sections based on uiState
     ctx.uiState.customSections?.forEach((section) => {
       sections.push({
         type: 'link',
         href: `/custom/${section.id}`,
         label: section.name
       });
     });
     
     return sections;
   })
   ```

4. **Block title** (displayed in left overview panel):
   ```typescript
   .title((ctx) => `${ctx.args.name} - Analysis`)
   ```

5. **Output computations** that can access all state components:
   ```typescript
   .output('someOutput', (ctx) => {
     // Access current args via ctx.args
     // Access production args via ctx.activeArgs (snapshot from last run)
     // Access current uiState via ctx.uiState
     // Note: Navigation state is not accessible in model lambdas
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

**Navigation Management:**
Navigation state is managed separately from the persisted model:

```typescript
// Navigation methods
app.navigateTo('/section-name');           // Direct navigation
app.updateNavigationState((nav) => {       // Callback-based update
  nav.href = '/new-section';
});

// Navigation state access
app.href;                                  // Current href (computed)
app.queryParams;                          // Parsed query parameters
app.snapshot.navigationState;             // Full navigation state
```

**Route Resolution:**
The UI uses sections to define available routes:

```typescript
// In app definition
routes: {
  '/': () => MainPage,
  '/settings': () => SettingsPage,
  '/custom/:id': () => CustomSectionPage,  // Dynamic routes with params
}

// Current route resolution
const CurrentView = computed(() => {
  const app = sdk.useApp();
  const pathname = parsePathname(app.snapshot.navigationState.href);
  return pathname ? app.getRoute(pathname) : undefined;
});
```

**Component Integration:**
```typescript
// Inside a Vue component
<template>
  <PlBlockPage>
    <template #title>{{ section.label }}</template>
    <PlBtnPrimary @click="navigateToSettings">Go to Settings</PlBtnPrimary>
  </PlBlockPage>
</template>

<script setup>
const app = useApp();

const navigateToSettings = () => {
  app.navigateTo('/settings');
};

// Access query parameters for dynamic sections
const sectionId = computed(() => app.queryParams.id);
</script>
```

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
2. **Track which blocks need re-computation** when upstreams change
3. **Route data flow** between blocks through the result pool

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
- **Always uses current `args`** (not `currentArgs`)
- **Provides quick feedback** for UI updates
- **Uses simplified dependency model** (linear progression)
- **Rate-limited execution** (configurable blocks per second)
- **Cached results** available as `stagingOutput`, `stagingCtx`, `stagingUiCtx`

### Production

Production is the full execution mode that:
- **Requires explicit user action** (clicking "Run" when `argsValid` returns true)
- **Uses `currentArgs`** - a snapshot of `args` captured when user hits "Run"
- **Executes on backend infrastructure** with full resources
- **Respects complex dependencies** from PlRefs
- **Produces final results** for downstream consumption
- **Maintains state fields**: `prodArgs`, `prodOutput`, `prodCtx`, `prodUiCtx`

### State Transitions

Blocks can be in several states:
1. **Not rendered**: No staging or production outputs exist
2. **Staging only**: Quick preview available, no production run
3. **Stale production**: Production exists but `prodArgs` differs from `currentArgs`
4. **Fresh production**: Production matches current args (`prodArgs` equals `currentArgs`)
5. **Limbo**: Production results kept despite upstream changes
6. **Running**: Currently executing (staging or production)

### Run Button Logic

The "Run" button is enabled when all of the following conditions are met:
- Block is in **stale mode** (current `args` differ from `currentArgs`) OR has never been run
- Current `args` are **valid** (as determined by `argsValid` function)
- All **upstream blocks** are either valid or already calculated

When the run button is clicked, all blocks on the dependency path to the target block (including the target) are executed using their most recent `args` values. The system captures a snapshot of each block's `args` as `currentArgs` at the moment execution begins.

## Context and Result Pool

The execution context (`resultPool` in models) provides access to:
- **Upstream block outputs** via PlRef resolution
- **Block metadata** and specifications
- **Cross-block data sharing** through the result pool

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
3. **Middle layer persists** → args/uiState persisted to resources
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

1. **No unified state object**: Args, uiState, and navigationState are separate concerns
2. **Navigation state not persisted**: Each user maintains independent navigation state, not shared across sessions or observers
3. **Fixed state structure**: Cannot dynamically extend state components beyond args/uiState/navigation/sections
4. **Static initial values**: Initial args and uiState must be constants (sections can be dynamic)
5. **No partial state updates**: Full object replacement required for args and uiState
6. **No custom state partitions**: Limited to args/uiState/navigation/sections architecture
7. **Section evaluation overhead**: Sections are re-evaluated whenever args or uiState change, even if sections don't depend on those changes
8. **Navigation state isolation**: Navigation state is not accessible in model lambdas, preventing section generation based on current route
9. **Route matching limitations**: No built-in support for complex routing patterns like nested routes or route parameters extraction

## Implementation References

Key files for understanding the implementation:

**Core State Management:**
- `platforma/sdk/model/src/builder.ts` - Block model definition API, `withArgs`/`withUiState` methods, type propagation
- `platforma/sdk/ui-vue/src/defineApp.ts` - UI app definition and type propagation from model to UI
- `platforma/lib/node/pl-middle-layer/src/mutator/project.ts` - State persistence
- `platforma/lib/node/pl-middle-layer/src/middle_layer/block.ts` - State retrieval
- `platforma/lib/model/common/src/block_state.ts` - Type definitions
- `platforma/sdk/ui-vue/src/internal/createAppV1.ts` & `createAppV2.ts` - UI state management
- `platforma/lib/node/pl-middle-layer/src/model/project_model_util.ts` - Dependency graphs

**Navigation State:**
- `platforma/lib/node/pl-middle-layer/src/middle_layer/navigation_states.ts` - Navigation state management class
- `platforma/lib/model/common/src/navigation.ts` - Navigation and section type definitions
- `platforma/lib/node/pl-middle-layer/src/middle_layer/project.ts` - Navigation state integration in Project class
- `platforma/sdk/ui-vue/src/components/BlockLayout.vue` - Route resolution and component rendering

**Sections and Overview:**
- `platforma/lib/node/pl-middle-layer/src/middle_layer/project_overview.ts` - Sections computation and project overview
- `platforma/lib/model/middle-layer/src/project_overview.ts` - BlockStateOverview type definitions
- `platforma/lib/model/common/src/bmodel/block_config.ts` - Block configuration including sections

**API Versions:**
- `platforma/sdk/model/src/block_api_v2.ts` - V2 API interface definitions
- `platforma/sdk/model/src/platforma.ts` - Platform API version handling
