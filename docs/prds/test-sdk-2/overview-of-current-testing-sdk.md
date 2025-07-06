# Overview of the Current Platforma Testing SDK

This document provides a comprehensive overview of the current Platforma testing framework. It details its architecture, core components, dependencies, and typical usage patterns. It also provides a critical assessment of its known issues and limitations, drawing from developer feedback and analysis of existing tests.

## 1. Core Architecture

The testing framework is built upon **`vitest`** and provides a suite of utilities to facilitate the integration testing of Platforma "blocks". It is organized into several layers of abstraction, delivered via `vitest`'s `test.extend` mechanism.

### Core Components:

The framework is structured into three main components, delivered as `vitest` fixtures:

-   **`plTest` (`test-pl.ts`)**: This is the base layer. It extends `vitest`'s `test` to manage the core connection to a Platforma backend. For each test, it creates an isolated temporary folder and initializes a `PlClient` instance connected to a temporary backend root to ensure test isolation.

-   **`blockTest` (`test-block.ts`)**: This layer extends `plTest` and is the primary tool for integration testing of Platforma blocks. It provides a higher-level testing environment:
    -   `ml`: An initialized `MiddleLayer` instance, which acts as the main API for interacting with projects and blocks.
    -   `rawPrj`: A `Project` instance, pre-created as a container for the blocks under test.
    -   `helpers`: A collection of asynchronous helper functions, including `awaitBlockDone`, `awaitBlockDoneAndGetStableBlockState`, and `getLocalFileHandle`.

-   **`tplTest` (`test-template.ts`)**: A more specialized layer for testing low-level "templates" (e.g., Tengo-based workflows). It's less frequently used in day-to-day block development.

## 2. Core Concepts and System Dependencies

The test framework is deeply integrated with the Platforma architecture. To use it effectively, a developer must have a working knowledge of several key libraries and concepts:

-   **`@milaboratories/pl-middle-layer`**: This is the most significant dependency. It provides the primary API for test automation, including:
    -   `MiddleLayer`: The main entry point for high-level interactions like creating projects.
    -   `Project`: The container for blocks, managing their state, arguments, and execution.
    -   `DriverKit`: A set of drivers (`blobDriver`, `pFrameDriver`) for direct interaction with different data storage types, essential for inspecting block outputs.
-   **`@milaboratories/computable`**: This library provides the `Computable` abstraction, representing a value that may be pending, changing, or unstable. Block states are exposed as `Computable`s, making it necessary to wait for them to stabilize before making assertions.
-   **`@milaboratories/pl-tree`**: Implements `SynchronizedTreeState`, which is used to create a synchronized, observable view of a resource tree in Platforma. The `awaitBlockDone` helper relies on this to detect when a block has finished its computation by observing the project's overview tree.

## 3. Typical Test Workflow

A typical test using `blockTest` follows a consistent, imperative pattern that involves significant manual setup and synchronization:

1.  **Setup:** Add necessary blocks to the `rawPrj` project.
2.  **Configuration:** Set block arguments, often using `helpers.getLocalFileHandle` for file inputs or wiring blocks together by passing output references.
3.  **Execution:** Run one or more blocks using `rawPrj.runBlock(...)`.
4.  **Synchronization:** Explicitly wait for the computation to finish using `helpers.awaitBlockDone(...)` and for the block's state to stabilize using `awaitStableState(...)`.
5.  **Assertion:** Inspect the block's outputs, which often requires using the low-level `ml.driverKit` to read data from blobs or columnar p-frames, and then assert correctness.

The following snippet from a real test illustrates this verbose workflow:

```typescript
blockTest(
  'simple project',
  { timeout: 100000 },
  async ({ rawPrj: project, ml, helpers, expect }) => {
    // 1. Setup
    const sndBlockId = await project.addBlock('Samples & Data', samplesAndDataBlockSpec);
    const clonotypingBlockId = await project.addBlock('MiXCR Clonotyping', myBlockSpec);

    // 2. Configuration
    const r1Handle = await helpers.getLocalFileHandle('./assets/small_data_R1.fastq.gz');
    /* ... more setup ... */
    project.setBlockArgs(sndBlockId, { /* ... args ... */ });

    // 3. Execution
    await project.runBlock(sndBlockId);

    // 4. Synchronization (with manual timeouts)
    await helpers.awaitBlockDone(sndBlockId, 8000);
    const clonotypingStableState1 = (await awaitStableState(
      clonotypingBlockState,
      25000
    )) as InferBlockState<typeof platforma>;

    /* ... more configuration and execution ... */

    await project.runBlock(clonotypingBlockId);
    const clonotypingStableState3 = (await helpers.awaitBlockDoneAndGetStableBlockState(
      clonotypingBlockId,
      100000 // another manual timeout
    )) as InferBlockState<typeof platforma>;

    // 5. Assertion (with manual output parsing)
    const outputs3 = wrapOutputs<BlockOutputs>(clonotypingStableState3.outputs);
    const alignReport = AlignReport.parse(
      JSON.parse(
        Buffer.from(
          await ml.driverKit.blobDriver.getContent(alignJsonReportEntry!.value!.handle)
        ).toString('utf8')
      )
    );
    expect(alignReport.aligned).greaterThan(2);
  }
);
```

## 4. Critical Issues and Assessment

While functional, the current framework has several significant issues that negatively impact developer experience, test reliability, and maintainability.

### a. Verbosity, Complexity, and Boilerplate

The most significant barrier to effective testing is the sheer verbosity and complexity of the framework's API, which leads to excessive boilerplate and a steep learning curve.

-   **Problem**: Writing tests is extremely verbose. The imperative cycle of `addBlock`, `setBlockArgs`, `runBlock`, `awaitBlockDone`, and `awaitStableState` must be repeated for almost every block in a chain. The core test logic is often obscured by this setup and synchronization boilerplate.

-   **Impact**: Tests are difficult and time-consuming to write, read, and maintain. Setting up multi-block workflows is particularly cumbersome.

-   **Problem**: Accessing block outputs is not straightforward. It is a multi-step process that requires deep knowledge of the system's internals:
    1.  Wait for the block state to stabilize with `awaitStableState`.
    2.  Perform a verbose cast on the result: `as InferBlockState<typeof platforma>`.
    3.  Use a `wrapOutputs` helper to get a more accessible object.
    4.  Use low-level `driverKit` methods (e.g., `ml.driverKit.blobDriver.getContent`) to get a raw buffer.
    5.  Manually parse the buffer (e.g., `JSON.parse(Buffer.from(...))`).
-   **Impact**: This adds significant complexity and boilerplate, making even simple assertions difficult and hurting test readability.

-   **Problem**: To write tests, a developer must understand a wide array of low-level Platforma concepts: the Middle Layer, Projects, Computables, P-Frames, Blobs, Resource IDs, and the driver model. The distinction between helpers like `awaitBlockDone` and `awaitStableState` can also be confusing.
-   **Impact**: The learning curve for new developers is steep. The framework exposes too much of the underlying implementation detail, forcing test authors to deal with concepts that should be abstracted away.

### b. The Timeout Problem

Another critical issue is the pervasive and flawed handling of timeouts.

-   **Problem**: Functions like `awaitBlockDone` and `awaitStableState` require developers to provide an explicit timeout in milliseconds. These timeouts are completely disconnected from the master test timeout configured in `vitest`.
-   **Impact**:
    -   **Flaky Tests**: Developers must guess how long a block will run. Short timeouts lead to brittle tests that fail intermittently on slower machines or in CI environments.
    -   **Slow Test Suites**: To avoid flakiness, developers are forced to set excessively long timeouts (e.g., `200000` or `300000` ms), which dramatically slows down the entire test suite.
    -   **Poor Developer Experience**: Guessing, tweaking, and debugging timeouts is a frustrating and time-consuming distraction from writing meaningful test logic.
    -   **Misleading Errors**: If a `vitest` timeout is exceeded, the test fails with a generic `vitest` error, not a specific error from the helper function, making it harder to debug the root cause.
-   **Root Cause**: The framework creates its own `AbortSignal.timeout()` instances instead of leveraging the `AbortSignal` provided by the `vitest` test context.

### c. Clumsy and Verbose Type Handling

A major source of friction is the manual and unintuitive process required to work with strongly-typed block states and outputs. The framework does not automatically infer types based on the block being tested.

-   **Problem**: Getting a typed block state is a multi-step, manual process:
    1.  The developer must manually import the `platforma` model object from the block's `.model` package (e.g., `import { platforma } from '@my-org/my-block.model'`).
    2.  Functions like `awaitStableState` or `helpers.awaitBlockDoneAndGetStableBlockState` return a weakly-typed state.
    3.  The developer must explicitly cast this result using the `InferBlockState` utility type and the imported model: `as InferBlockState<typeof platforma>`.
    4.  To access outputs in a typed manner, another helper, `wrapOutputs`, is often required, sometimes with another explicit generic: `wrapOutputs<BlockOutputs>(...)`.

-   **Impact**:
    -   **High Verbosity**: This pattern is repeated for nearly every state retrieval, adding significant boilerplate.
    -   **Error-Prone**: Developers can easily import and cast with the wrong block's model, leading to subtle bugs that the type system should prevent.
    -   **Steep Learning Curve**: This process is not discoverable. A developer must have prior knowledge of the relationship between the `platforma` model object, the `InferBlockState` type, and the `wrapOutputs` helper. The framework's function signatures do not guide the user towards this solution.

The following snippet highlights the required casting and type annotations:

```typescript
// Manual import of the model and specific types
import { platforma, type BlockOutputs } from '@my-org/my-block.model';
import { type InferBlockState, wrapOutputs } from '@platforma-sdk/model';

// ... inside a test ...

// Manual cast is required to get a typed state
const stableState = (await awaitStableState(
  project.getBlockState(blockId),
  25000
)) as InferBlockState<typeof platforma>;

// wrapOutputs helper is then used on the state's outputs
const outputs = wrapOutputs<BlockOutputs>(stableState.outputs);
```

### d. Poor Error Reporting

-   **Problem**: When a test fails, the error messages often lack context. A timeout error, for example, will simply state that an operation was "Aborted while awaiting stable value" without detailing which block or state was being watched.
-   **Impact**: Debugging failing tests is more difficult and time-consuming than it needs to be.
