// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { beforeAll, describe, expect, it, vi } from "vitest";

function makeStub(name: string) {
  return defineComponent({
    name,
    props: ["modelValue", "options", "optionsSearch", "error", "errorStatus"],
    emits: ["update:modelValue"],
    setup(_, { slots }) {
      return () => h("div", { "data-stub": name }, slots.default?.());
    },
  });
}

vi.mock("@milaboratories/uikit", () => ({
  PlAutocomplete: makeStub("PlAutocomplete"),
  PlAutocompleteMulti: makeStub("PlAutocompleteMulti"),
  PlDropdown: makeStub("PlDropdown"),
  PlIcon16: makeStub("PlIcon16"),
  PlNumberField: makeStub("PlNumberField"),
  PlTextField: makeStub("PlTextField"),
  PlToggleSwitch: makeStub("PlToggleSwitch"),
  Slider: makeStub("Slider"),
  filterUiMetadata: new Proxy(
    {},
    {
      get: (_t, key: string) => ({
        label: key,
        supportedFor: () => true,
      }),
    },
  ),
}));

let FilterEditor: typeof import("./FilterEditor.vue").default;
let DEFAULT_FILTERS: typeof import("./constants").DEFAULT_FILTERS;
let SUPPORTED_FILTER_TYPES: typeof import("./constants").SUPPORTED_FILTER_TYPES;

type EditableFilter = import("./types").EditableFilter;
type PlAdvancedFilterColumnId = import("./types").PlAdvancedFilterColumnId;
type SourceOptionInfo = import("./types").SourceOptionInfo;

beforeAll(async () => {
  FilterEditor = (await import("./FilterEditor.vue")).default;
  const constants = await import("./constants");
  DEFAULT_FILTERS = constants.DEFAULT_FILTERS;
  SUPPORTED_FILTER_TYPES = constants.SUPPORTED_FILTER_TYPES;
});

const columnA = "colA" as PlAdvancedFilterColumnId;
const columnB = "colB" as PlAdvancedFilterColumnId;

const columnOptions: SourceOptionInfo[] = [
  {
    id: columnA,
    label: "Column A",
    spec: { kind: "PColumn", name: "a", valueType: "String", axesSpec: [] },
  },
  {
    id: columnB,
    label: "Column B",
    spec: { kind: "PColumn", name: "b", valueType: "Int", axesSpec: [] },
  },
];

function mountEditor(
  filter: EditableFilter,
  handlers: {
    onUpdateFilter?: (f: EditableFilter) => void;
    onDelete?: (c: PlAdvancedFilterColumnId) => void;
    onChangeOperand?: () => void;
  } = {},
) {
  return mount(FilterEditor, {
    props: {
      filter,
      isLast: false,
      operand: "and",
      enableDnd: false,
      columnOptions,
      supportedFilters: SUPPORTED_FILTER_TYPES,
      getSuggestOptions: () => [],
      onDelete: handlers.onDelete ?? (() => {}),
      onUpdateFilter: handlers.onUpdateFilter ?? (() => {}),
      onChangeOperand: handlers.onChangeOperand ?? (() => {}),
    },
  });
}

function findDropdowns(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents({ name: "PlDropdown" });
}

describe("FilterEditor.vue: changeFilterType", () => {
  it("changing type from isNA to greaterThan emits filter with new type and default x", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "isNA", column: columnA }, { onUpdateFilter });

    // second PlDropdown (index 1) is the filter-type selector
    const typeDropdown = findDropdowns(wrapper)[1];
    typeDropdown.vm.$emit("update:modelValue", "greaterThan");

    expect(onUpdateFilter).toHaveBeenCalledTimes(1);
    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "greaterThan",
      column: columnA,
      x: 0,
    });
  });

  it("changing type from patternEquals to greaterThan drops stale `value`", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor(
      { type: "patternEquals", column: columnA, value: "hello" },
      { onUpdateFilter },
    );

    findDropdowns(wrapper)[1].vm.$emit("update:modelValue", "greaterThan");

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "greaterThan",
      column: columnA,
      x: 0,
    });
    expect(onUpdateFilter.mock.calls[0][0]).not.toHaveProperty("value");
  });

  it("changing between numeric filters resets `x` to default (data fields are not preserved)", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor(
      { type: "greaterThan", column: columnA, x: 42 },
      { onUpdateFilter },
    );

    findDropdowns(wrapper)[1].vm.$emit("update:modelValue", "lessThan");

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "lessThan",
      column: columnA,
      x: 0,
    });
  });

  it("changing to patternFuzzyContainSubsequence populates all default fields", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "isNA", column: columnA }, { onUpdateFilter });

    findDropdowns(wrapper)[1].vm.$emit("update:modelValue", "patternFuzzyContainSubsequence");

    expect(onUpdateFilter).toHaveBeenCalledWith({
      ...DEFAULT_FILTERS.patternFuzzyContainSubsequence,
      column: columnA,
    });
  });

  it("undefined newType is ignored (no emit)", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "isNA", column: columnA }, { onUpdateFilter });

    findDropdowns(wrapper)[1].vm.$emit("update:modelValue", undefined);

    expect(onUpdateFilter).not.toHaveBeenCalled();
  });

  it("preserves meta fields (id, isExpanded, isSuppressed, source) across type change", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor(
      {
        type: "patternEquals",
        column: columnA,
        value: "foo",
        id: 777,
        isExpanded: true,
        isSuppressed: false,
        source: "abc",
      } as unknown as EditableFilter,
      { onUpdateFilter },
    );

    findDropdowns(wrapper)[1].vm.$emit("update:modelValue", "greaterThan");

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "greaterThan",
      column: columnA,
      x: 0,
      id: 777,
      isExpanded: true,
      isSuppressed: false,
      source: "abc",
    });
  });

  it("does not carry over unknown data fields from the old filter", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "topN", column: columnA, n: 7 }, { onUpdateFilter });

    findDropdowns(wrapper)[1].vm.$emit("update:modelValue", "isNA");

    const emitted = onUpdateFilter.mock.calls[0][0];
    expect(emitted).toEqual({ type: "isNA", column: columnA });
    expect(emitted).not.toHaveProperty("n");
  });
});

describe("FilterEditor.vue: updateFilterProp", () => {
  it("editing `x` on greaterThan filter emits updated filter preserving type and column", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "greaterThan", column: columnA, x: 0 }, { onUpdateFilter });

    const numberField = wrapper.findComponent({ name: "PlNumberField" });
    numberField.vm.$emit("update:modelValue", 99);

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "greaterThan",
      column: columnA,
      x: 99,
    });
  });

  it("editing `value` on patternEquals emits updated value", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor(
      { type: "patternEquals", column: columnA, value: "" },
      { onUpdateFilter },
    );

    const autocomplete = wrapper.findComponent({ name: "PlAutocomplete" });
    autocomplete.vm.$emit("update:modelValue", "abc");

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "patternEquals",
      column: columnA,
      value: "abc",
    });
  });

  it("editing substring `value` on patternContainSubsequence emits updated value", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor(
      { type: "patternContainSubsequence", column: columnA, value: "" },
      { onUpdateFilter },
    );

    const textField = wrapper.findComponent({ name: "PlTextField" });
    textField.vm.$emit("update:modelValue", "xyz");

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "patternContainSubsequence",
      column: columnA,
      value: "xyz",
    });
  });

  it("editing `n` on topN emits updated value", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "topN", column: columnA, n: 10 }, { onUpdateFilter });

    const numberField = wrapper.findComponent({ name: "PlNumberField" });
    numberField.vm.$emit("update:modelValue", 5);

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "topN",
      column: columnA,
      n: 5,
    });
  });
});

describe("FilterEditor.vue: changeSourceId", () => {
  it("changing source to a column supporting the current filter keeps the filter type", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "isNA", column: columnA }, { onUpdateFilter });

    // first PlDropdown is the source selector
    findDropdowns(wrapper)[0].vm.$emit("update:modelValue", columnB);

    expect(onUpdateFilter).toHaveBeenCalledWith({
      type: "isNA",
      column: columnB,
    });
  });

  it("undefined newSourceId is ignored", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "isNA", column: columnA }, { onUpdateFilter });

    findDropdowns(wrapper)[0].vm.$emit("update:modelValue", undefined);

    expect(onUpdateFilter).not.toHaveBeenCalled();
  });

  it("unknown source id is ignored", () => {
    const onUpdateFilter = vi.fn();
    const wrapper = mountEditor({ type: "isNA", column: columnA }, { onUpdateFilter });

    findDropdowns(wrapper)[0].vm.$emit("update:modelValue", "unknown" as PlAdvancedFilterColumnId);

    expect(onUpdateFilter).not.toHaveBeenCalled();
  });
});

describe("FilterEditor.vue: onDelete", () => {
  it("clicking the close icon invokes onDelete with the current column id", async () => {
    const onDelete = vi.fn();
    const wrapper = mountEditor({ type: "isNA", column: columnA }, { onDelete });

    // the close button wraps a PlIcon16 with name="close"
    const closeBtn = wrapper.find('[class*="closeButton"]');
    await closeBtn.trigger("click");

    expect(onDelete).toHaveBeenCalledWith(columnA);
  });
});
