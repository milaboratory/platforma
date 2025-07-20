# Block Actions PRD

*Document Date: January 2025*  
*Related Documents: unified-block-state/current.md, unified-block-state/final-point-raw.md, unified-block-state/prd-raw.md*

## Overview

Block Actions represent a fundamental architectural shift in how Platforma blocks manage state mutations and inter-block communication. Instead of the current implicit state management system where UI components directly modify block state through reactive assignments, Block Actions introduce explicit, transactional functions that serve as the single entry point for all state modifications.

A Block Action is a synchronous, transactional lambda function that:

- **Atomically mutates block state** - Both persisted `state` and ephemeral `localState`
- **Returns structured results** - Can return arbitrary JSON data to callers
- **Receives caller context** - Knows which block/system initiated the action
- **Supports access control** - Actions can be private (block-only) or public (cross-block)
- **Integrates with system events** - Can be triggered by navigation, block lifecycle, or external calls
- **Enables cross-block communication** - Blocks can invoke actions on other blocks with proper permissions

This design moves the majority of state management logic from the Platforma runtime into the block code itself, providing greater flexibility while maintaining clear architectural boundaries.

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
