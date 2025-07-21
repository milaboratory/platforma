# Block Actions PRD

## Overview

Block Actions represent the final piece of the Platforma block state management puzzle, completing the existing system by providing missing functionality and unifying various existing concepts under a single, coherent API. The current implicit state management system (reactive assignments, args derivation, sections, navigation) remains intact and continues to work as before. Block Actions complement this foundation by adding capabilities that were previously difficult or impossible to implement.

A Block Action is a synchronous, transactional lambda function that:

- **Extends beyond basic state mutations** - While UI can still use reactive assignments, actions handle complex scenarios requiring coordination
- **Enables cross-block communication** - Blocks can invoke actions on other blocks with proper permissions
- **Handles system event integration** - Responds to navigation, block lifecycle, and other system events
- **Provides structured interaction patterns** - Returns arbitrary JSON data to callers with full caller context
- **Supports access control** - Actions can be private (block-only) or public (cross-block)
- **Unifies existing scattered functionality** - Brings together navigation handling, lifecycle management, and inter-block coordination under one concept

This design completes the block development experience by filling gaps in the current system while preserving all existing functionality and development patterns.

## Motivations

### 1. **Runtime Simplification**
The current state management system requires complex coordination between the middle layer, UI layer, and various state synchronization mechanisms. By moving state mutation logic into block code, we reduce runtime complexity and make the system more predictable.

### 2. **Improved Developer Experience**
Block developers currently need to understand multiple state management patterns (args, uiState, navigation state, sections) and their interactions. Actions provide a single, unified interface for all state mutations, making block development more intuitive.

### 3. **Cross-Block Communication**
Current blocks have limited ability to communicate with each other beyond PlRef dependencies. Actions enable rich inter-block communication patterns needed for advanced biological workflows, such as:
- Downstream blocks configuring upstream block parameters
- Focus synchronization between related blocks
- State sharing without backend round-trips

### 4. **Migration and Plugin Support**
The action-based architecture provides the foundation for sophisticated state migration and plugin systems, as actions can encapsulate complex state transformations and provide standardized interfaces for plugins.

### 5. **Transactional State Management**
Current state updates can be partially applied, leading to inconsistent intermediate states. Actions ensure atomic, transactional updates that maintain consistency across all state components.

### 6. **Easier Testing and Debugging**
Actions provide clear entry points for state changes, making it easier to test block behavior, trace state modifications, and debug issues in complex workflows.

## Low-level action API

### Action anatomy

Action is a function that receives it's inputs via the context found in global variable, similar to the output lambdas, and returns result in a standartized form:

```typescript
{
  /** If not undefined, instructs runtime to update the state */
  state?: any;
  /** If not undefined, instructs runtime to update the localState */
  localState?: any;
  /** Value to return to the caller */
  result: ValueOrError<any>;
  /** List of other things the action instructs runtime to execute */
  effects: Effect[];
}
```

`Effect` can be things like:
- request to switch focus to another block
- request to add specific version of specific blocks before or after a specific block
- potentially other things, maybe calling other actions or writing to soem global project state (to be added in the future)

Overall list of potential effects is not a focus of this document.

Actions can be executed in different environments:
- "persistent" - the environment where action can write to the persistent `state` (and this write is guaranteed to be atomic in respect to the `state`, because the lambda will be executed within transaction)
- "local" - where action can't write to persistent `state`, yet can read it; writing to `state` should be considered an error in this context



## Use Cases

### UC1: Basic State Mutation
*[Placeholder for code snippet showing simple state update action]*

**Description:** Replace current reactive state assignments with explicit action calls.

### UC2: Cross-Block Communication
*[Placeholder for code snippet showing one block invoking action on another block]*

**Description:** Enable downstream blocks to configure upstream block parameters or trigger specific behaviors.

### UC3: System Event Handling
*[Placeholder for code snippet showing actions triggered by navigation or lifecycle events]*

**Description:** Handle block opening, closing, section navigation, and other system events through actions.

### UC4: Complex State Transitions
*[Placeholder for code snippet showing action that updates multiple state components atomically]*

**Description:** Perform complex state updates that span both persisted state and local state in a single transaction.

### UC5: Plugin Integration
*[Placeholder for code snippet showing plugin-provided actions]*

**Description:** Allow plugins to provide actions that integrate seamlessly with block state management.

### UC6: State Migration
*[Placeholder for code snippet showing migration action that transforms state during block upgrades]*

**Description:** Handle state schema migrations when blocks are updated to newer versions.

### UC7: Conditional Actions with Validation
*[Placeholder for code snippet showing action with pre-conditions and validation]*

**Description:** Implement actions that validate inputs and current state before performing mutations.

### UC8: Async Operation Coordination
*[Placeholder for code snippet showing action that coordinates async operations]*

**Description:** Manage complex async workflows while maintaining transactional guarantees for state updates.

## Technical Architecture

### Action Definition
*[Placeholder for technical details on how actions are defined in block models]*

### Execution Context
*[Placeholder for details on action execution environment, caller context, and available APIs]*

### State Access Patterns
*[Placeholder for details on how actions access and modify different types of state]*

### Inter-Block Communication Protocol
*[Placeholder for details on action invocation between blocks, permissions, and security]*

### Integration with Current State System
*[Placeholder for details on how actions integrate with existing args, sections, navigation, etc.]*

## Implementation Plan

### Phase 1: Core Action Infrastructure
*[Placeholder for implementation details of basic action system]*

### Phase 2: Cross-Block Communication
*[Placeholder for implementation details of inter-block action calls]*

### Phase 3: Migration and Compatibility
*[Placeholder for implementation details of migrating existing blocks to action-based system]*

### Phase 4: Advanced Features
*[Placeholder for implementation details of plugins, advanced state management, etc.]*

## Backward Compatibility

*[Placeholder for details on maintaining compatibility with existing blocks and gradual migration strategy]*

## Performance Considerations

*[Placeholder for details on performance implications, optimization strategies, and resource management]*

## Security and Access Control

*[Placeholder for details on action permissions, caller validation, and security model]*
