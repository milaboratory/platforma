import type {
  ColumnUniversalId,
  ColumnValueOptionsModel,
  PFrameHandle,
} from "@platforma-sdk/model";
import { createGlobalPObjectId } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { reactive, shallowRef } from "vue";
import { usePlColumnValueSettings } from "./settings";

describe("usePlColumnValueSettings", () => {
  test("offers nothing while no column is picked", () => {
    expect(settingsOf({ valueColumn: undefined, source: present(ROUND) })).toEqual({
      type: "none",
    });
  });

  test("offers the values of the output made for the picked column", () => {
    expect(settingsOf({ valueColumn: ROUND, source: present(ROUND) })).toEqual({
      type: "present",
      model: present(ROUND),
    });
  });

  test("is pending while the output is not computed, describes an earlier pick, or resolves", () => {
    expect(settingsOf({ valueColumn: ROUND, source: undefined })).toEqual({ type: "pending" });
    expect(settingsOf({ valueColumn: ROUND, source: present(DONOR) })).toEqual({
      type: "pending",
    });
    expect(
      settingsOf({ valueColumn: ROUND, source: { type: "resolving", valueColumn: ROUND } }),
    ).toEqual({ type: "pending" });
  });

  test("is absent once the picked column is gone", () => {
    expect(
      settingsOf({ valueColumn: ROUND, source: { type: "absent", valueColumn: ROUND } }),
    ).toEqual({ type: "absent" });
  });

  test("follows the pick and the output", () => {
    const valueColumn = shallowRef<ColumnUniversalId | undefined>(ROUND);
    const source = shallowRef<ColumnValueOptionsModel | undefined>(present(ROUND));
    const settings = usePlColumnValueSettings({ source, valueColumn });

    valueColumn.value = DONOR;
    expect(settings.value).toEqual({ type: "pending" });
    source.value = present(DONOR);
    expect(settings.value).toEqual({ type: "present", model: present(DONOR) });
  });

  test("follows a frame the output changes in place", () => {
    const source = reactive(present(ROUND));
    const settings = usePlColumnValueSettings({ source: () => source, valueColumn: ROUND });
    const before = settings.value;

    source.frame = "frame-after-rerun" as PFrameHandle;
    expect(settings.value).not.toBe(before);
    expect(settings.value).toEqual({
      type: "present",
      model: { ...present(ROUND), frame: "frame-after-rerun" },
    });
  });
});

// Internals

const ROUND = createGlobalPObjectId("samples", "pf.metadata.round");

const DONOR = createGlobalPObjectId("samples", "pf.metadata.donor");

function present(valueColumn: ColumnUniversalId) {
  return {
    type: "present",
    valueColumn,
    frame: `frame-of-${valueColumn}` as PFrameHandle,
    frameColumns: { value: createGlobalPObjectId("samples", "frame.column"), label: null },
  } satisfies ColumnValueOptionsModel;
}

function settingsOf(initial: {
  valueColumn: ColumnUniversalId | undefined;
  source: ColumnValueOptionsModel | undefined;
}) {
  return usePlColumnValueSettings(initial).value;
}
