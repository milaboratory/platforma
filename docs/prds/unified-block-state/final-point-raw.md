# Target state of Block State API

This document describes endpoin ot the state API, some of the concepts described here refers to things described in other documents and might require them for the context.

## Architectural decisions

- Main desicion that guided refinement of this proposla was to move as much logic from the runtime that executes block code to the block code itself, and give it sufficient APIs to implement all the needed features on top of that lower-level API.
- Main source of evidence for this decisin is experience of block development for Platforma and simple idea, that it is much cheaper to migrate blocks code then runtime, because it does not imply any state and API migrations, which often requires backward compatibility and many other things.
- Main giding principal for defining demand from the high-level API towords low-level API is ability to finally develop all the high level features that are not yet implemented in a way that brings the highest possible return on investment of time in terms of achieved simplicity of block development.
- Another guiding principal is establishment of clear and simple architectual layers in the system, that is clear to communicate and provides a picture that it is very easy to deside how and where implement what.

## List of features that seems to be enough to implement all the planned biological solutions

Not 100% of implementation details for them are described below, rather this list provides a context for the API described below

- Local state for storing ephemeral states like state of plots (like zooms), opened/closed state of panels, and other small or not so small things that are not mean to be persisted or shared between independent observers of the same projext / block
- More sophisticated navigation state, and overall more flexibility in this part
- Allow demonstration of other pages that main block ui in the block window, not withing iframe, but ocupying the whole page
- Allow cross-block communication to simplify things like: setting options from the downstream blocks to upstream blocks, focusing on a particular viwe within the upstream block from within the downstrream blocks, or doing other things like that
- Exporting some state form upstream blocks to downstream blocks without utilizing backend
- Sopisticated plugin capabilities allowing to hide guts of common behaviours and components from the block developers as much as possible (tables, graphs, common communication pattern with backend, like apssing filters, or annotation scripts, selections, or abstracting away file uploads/indexes and progress visualization)
- State migration, when block updates to a newer version there must be a clear way on how to migrate state managed by previous version of the block to the new state (the same applies for any state managed by plugins). Applies both to local and persisted state

## Low level

### State

Each block have exactly two pieces of state, everething else derived from those two JSON documents.

- `state` = persisted state
- `localState` = state that leaves
- `args` are derived from the `state`, available as RO state

### Actions

We should introduce a low-level concept called block action. Block action is a lambda, executed synchronously and transcationally, mutating block state and optionally instructing the system to perform actions like changin focus to a different block, or even adding a new block.
Actions may operate on localState only, or on both persisted and local states.
Actions can be invoked by the system at special points, like block update, block open and close, left panel section clicks or other system events.
Actions can also be invoked by other blocks, in different modes one block can run specific action for specific blocks.
Each call to action have arbitrty JSON as its input, and may return arbitrty result to the caller. Each call always have information about the caller (i.e. block name initiated the call, allowing a receiving block to ignore untrusted callers).
Even bofore this caller checks, actions are anyway have two types private and public, privete actions can only be called by the block itself (from UI).

## High level features

This section describes high level features (some existing, some not yet) and how they project onto the low-level concepts described above.

Important aspect here is that all the feature here can and must be implemented in SDK, and thus shipped with blocks rahter then Desktop, allowing for simpler implementation, minimal concerns about state and API migration, keeping all the changes isolated within single block, allowing to different APIs to co-exist in different blocks within the same project.

### State migration

Low-level API offers only on-block-upgrade hook, that may mutate the state, all other high level features like a versioned migration (like in databases), when user provides a migration per version, and migrations are executed one after another until latest version is reached. For that zero migration in this sequence may move actual state to the nested field, i.e. `{ /* state */ }` -> `{ __plSchemaVersion: number, state: { /* state */ } }`. Given this feature is enabled, all the model methods and and UI method must follow the suit and transparently unwrap / wrap the value, so the actual code everywhere stays the same.

### Plugins

Plugins are pieces of code that can be added to the model and used form within the UI or other UI mehods. Their state must be stored somewhere. A similar trick like with migration can be done to enable plugins, i.e. to add another wrapping level, leaving space for plugin states. This applies both for local and persisted states.

### Navigation and sections

Current implementation of sections and navigation can be migrated away from currently highly entangled runtime-block implementation to a much more clear implementation with higher bias towords block code.
Navigation stae can become just a part of localState. Block code may return a special object describing what to show in the left panel (might be combined with title), which will just provide arguments to be passed to the special on-navigate action.
In addition to title the object returned here may define absence or presence of run button and text and icon to be printed on it.

## Snippets

### State

