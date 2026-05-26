import { BackendCapability } from "@milaboratories/pl-middle-layer";
import { tplTest } from "@platforma-sdk/test";

// Sweep every method exposed by the @platforma-sdk/workflow-tengo:pframes-rs
// wrapper. One known-good schema validates the success path
// (`frame.buildQuery`). Everything else probes the error path with
// deliberately-bad inputs and asserts each call surfaces a clean Tengo
// error — proving the wrapper plumbing (lazy _load, JSON encode/decode,
// instance/static dispatch) works for every WIT method without a
// regression turning calls into "method missing" or wasm traps.

const TRAP_OR_MISSING = /wasm trap|unreachable|func_call|method missing|export missing/;

tplTest.concurrent(
  "pframes-rs wrapper — every method dispatches without trap or missing-method",
  async ({ pl, helper, expect, skip }) => {
    if (!pl.hasCapability(BackendCapability.WasmV1)) {
      skip();
      return;
    }

    const result = await helper.renderTemplate(
      false,
      "wasm.pframes-rs.wrapper",
      [
        "buildQueryOk",
        "frameDeleteColumnsBad",
        "axesCollapseBad",
        "frameFromJsonErr",
        "frameListColumns",
        "frameDiscoverColumnsBad",
        "frameFindColumnsBad",
        "frameEvaluateQueryBad",
        "frameRewriteLegacyQueryBad",
        "axesFromJsonErr",
        "axesExpand",
        "axesFindBad",
        "tableFromJsonErr",
        "tableFindColumnBad",
      ],
      () => ({}),
    );

    const outputs = await Promise.all(
      [
        "buildQueryOk",
        "frameDeleteColumnsBad",
        "axesCollapseBad",
        "frameFromJsonErr",
        "frameListColumns",
        "frameDiscoverColumnsBad",
        "frameFindColumnsBad",
        "frameEvaluateQueryBad",
        "frameRewriteLegacyQueryBad",
        "axesFromJsonErr",
        "axesExpand",
        "axesFindBad",
        "tableFromJsonErr",
        "tableFindColumnBad",
      ].map((k) => result.computeOutput(k, (a) => a?.getDataAsJson()).awaitStableValue()),
    );

    const [
      buildQueryOk,
      frameDeleteColumnsBad,
      axesCollapseBad,
      frameFromJsonErr,
      frameListColumns,
      frameDiscoverColumnsBad,
      frameFindColumnsBad,
      frameEvaluateQueryBad,
      frameRewriteLegacyQueryBad,
      axesFromJsonErr,
      axesExpand,
      axesFindBad,
      tableFromJsonErr,
      tableFindColumnBad,
    ] = outputs as string[];

    // Known-good: round-trip succeeded and contains expected entry shape.
    expect(buildQueryOk).toContain('"abundance"');

    // For every other slot the value must be a string. None of them
    // should look like a wasm trap or missing-method error — those would
    // indicate a wrapper plumbing regression rather than a schema-level
    // Err arm. Note: some slots may be "<skipped: from-json failed>" if
    // the fromJson minimal-spec attempt errored — that's fine, it just
    // means we got far enough to dispatch fromJson and surface its Err.
    const checked = [
      ["frameDeleteColumnsBad", frameDeleteColumnsBad],
      ["axesCollapseBad", axesCollapseBad],
      ["frameFromJsonErr", frameFromJsonErr],
      ["frameListColumns", frameListColumns],
      ["frameDiscoverColumnsBad", frameDiscoverColumnsBad],
      ["frameFindColumnsBad", frameFindColumnsBad],
      ["frameEvaluateQueryBad", frameEvaluateQueryBad],
      ["frameRewriteLegacyQueryBad", frameRewriteLegacyQueryBad],
      ["axesFromJsonErr", axesFromJsonErr],
      ["axesExpand", axesExpand],
      ["axesFindBad", axesFindBad],
      ["tableFromJsonErr", tableFromJsonErr],
      ["tableFindColumnBad", tableFindColumnBad],
    ] as const;

    for (const [name, value] of checked) {
      expect(typeof value, `${name} should be a string`).toBe("string");
      expect(value, `${name} must not look like a wasm trap or missing method`).not.toMatch(
        TRAP_OR_MISSING,
      );
    }
  },
);
