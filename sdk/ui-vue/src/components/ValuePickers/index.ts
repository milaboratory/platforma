import {
  PlDropdown as UikitPlDropdown,
  PlDropdownMulti as UikitPlDropdownMulti,
  PlDropdownMultiRef as UikitPlDropdownMultiRef,
  PlDropdownRef as UikitPlDropdownRef,
  PlValueLabel as UikitPlValueLabel,
} from "@milaboratories/uikit";
import type { Component } from "vue";
import { defineComponent, h } from "vue";
import { useBlockDependenciesHint } from "../PlBlockDependencies/missingValueHint";

/**
 * The uikit `PlDropdown` whose missing column or column value tells, in a tooltip, which block was to
 * provide it and what went wrong, when the block has the `blockDependencies` plugin.
 */
export const PlDropdown = withBlockDependenciesHint("PlDropdown", UikitPlDropdown);

/**
 * The uikit `PlDropdownMulti` whose missing columns and column values tell, in a tooltip, which block was to
 * provide them and what went wrong, when the block has the `blockDependencies` plugin.
 */
export const PlDropdownMulti = withBlockDependenciesHint("PlDropdownMulti", UikitPlDropdownMulti);

/**
 * The uikit `PlDropdownRef` whose missing column tells, in a tooltip, which block was to provide
 * it and what went wrong, when the block has the `blockDependencies` plugin.
 */
export const PlDropdownRef = withBlockDependenciesHint("PlDropdownRef", UikitPlDropdownRef);

/**
 * The uikit `PlDropdownMultiRef` whose missing columns tell, in a tooltip, which block was to
 * provide them and what went wrong, when the block has the `blockDependencies` plugin.
 */
export const PlDropdownMultiRef = withBlockDependenciesHint(
  "PlDropdownMultiRef",
  UikitPlDropdownMultiRef,
);

/**
 * The uikit `PlValueLabel` whose missing column or column value tells, in a tooltip, which block was to
 * provide it and what went wrong, when the block has the `blockDependencies` plugin.
 */
export const PlValueLabel = withBlockDependenciesHint("PlValueLabel", UikitPlValueLabel);

// Internals

/** `component` given the hint of the block as `missingValueHint`, unless the caller gives one. */
function withBlockDependenciesHint<C extends Component>(name: string, component: C): C {
  const wrapper = defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const hint = useBlockDependenciesHint();
      return () => h(component, { missingValueHint: hint, ...attrs }, slots);
    },
  });
  return wrapper as C;
}
