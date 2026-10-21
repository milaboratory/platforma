import {
  PlDropdown as UikitPlDropdown,
  PlDropdownMulti as UikitPlDropdownMulti,
  PlDropdownMultiRef as UikitPlDropdownMultiRef,
  PlDropdownRef as UikitPlDropdownRef,
  PlValueLabel as UikitPlValueLabel,
} from "@milaboratories/uikit";
import type { Component } from "vue";
import { defineComponent, h } from "vue";
import { useColumnLinksHint } from "./missingValueHint";

/**
 * The uikit `PlDropdown` whose missing column or column value tells, in a tooltip, which block was to
 * provide it and what went wrong, when the app computes column links.
 */
export const PlDropdown = withColumnLinksHint("PlDropdown", UikitPlDropdown);

/**
 * The uikit `PlDropdownMulti` whose missing columns and column values tell, in a tooltip, which block was to
 * provide them and what went wrong, when the app computes column links.
 */
export const PlDropdownMulti = withColumnLinksHint("PlDropdownMulti", UikitPlDropdownMulti);

/**
 * The uikit `PlDropdownRef` whose missing column tells, in a tooltip, which block was to provide
 * it and what went wrong, when the app computes column links.
 */
export const PlDropdownRef = withColumnLinksHint("PlDropdownRef", UikitPlDropdownRef);

/**
 * The uikit `PlDropdownMultiRef` whose missing columns tell, in a tooltip, which block was to
 * provide them and what went wrong, when the app computes column links.
 */
export const PlDropdownMultiRef = withColumnLinksHint(
  "PlDropdownMultiRef",
  UikitPlDropdownMultiRef,
);

/**
 * The uikit `PlValueLabel` whose missing column or column value tells, in a tooltip, which block was to
 * provide it and what went wrong, when the app computes column links.
 */
export const PlValueLabel = withColumnLinksHint("PlValueLabel", UikitPlValueLabel);

// Internals

/** `component` given the hint of the block as `missingValueHint`, unless the caller gives one. */
function withColumnLinksHint<C extends Component>(name: string, component: C): C {
  const wrapper = defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const hint = useColumnLinksHint();
      return () => h(component, { missingValueHint: hint, ...attrs }, slots);
    },
  });
  return wrapper as C;
}
