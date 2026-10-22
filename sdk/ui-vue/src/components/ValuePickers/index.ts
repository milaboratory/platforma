import {
  PlDropdown as UikitPlDropdown,
  PlDropdownMulti as UikitPlDropdownMulti,
  PlDropdownMultiRef as UikitPlDropdownMultiRef,
  PlDropdownRef as UikitPlDropdownRef,
  PlValueLabel as UikitPlValueLabel,
} from "@milaboratories/uikit";
import type { Component } from "vue";
import { defineComponent, h } from "vue";
import { useColumnLinksMissingValue } from "./columnLinksMissingValue";

/**
 * The uikit `PlDropdown` whose missing column or column value tells, in a tooltip, which block was to
 * provide it and what went wrong, when the app computes column links.
 */
export const PlDropdown = withColumnLinksMissingValue("PlDropdown", UikitPlDropdown);

/**
 * The uikit `PlDropdownMulti` whose missing columns and column values tell, in a tooltip, which block was to
 * provide them and what went wrong, when the app computes column links.
 */
export const PlDropdownMulti = withColumnLinksMissingValue("PlDropdownMulti", UikitPlDropdownMulti);

/**
 * The uikit `PlDropdownRef` whose missing column tells, in a tooltip, which block was to provide
 * it and what went wrong, when the app computes column links.
 */
export const PlDropdownRef = withColumnLinksMissingValue("PlDropdownRef", UikitPlDropdownRef);

/**
 * The uikit `PlDropdownMultiRef` whose missing columns tell, in a tooltip, which block was to
 * provide them and what went wrong, when the app computes column links.
 */
export const PlDropdownMultiRef = withColumnLinksMissingValue(
  "PlDropdownMultiRef",
  UikitPlDropdownMultiRef,
);

/**
 * The uikit `PlValueLabel` whose missing column or column value tells, in a tooltip, which block was to
 * provide it and what went wrong, when the app computes column links.
 */
export const PlValueLabel = withColumnLinksMissingValue("PlValueLabel", UikitPlValueLabel);

// Internals

/**
 * `component` showing a missing value by the column links of the block, as `missingValueLabel`
 * and `missingValueTooltip`, unless the caller gives its own.
 */
function withColumnLinksMissingValue<C extends Component>(name: string, component: C): C {
  const wrapper = defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const missing = useColumnLinksMissingValue();
      return () =>
        h(
          component,
          { missingValueLabel: missing?.label, missingValueTooltip: missing?.tooltip, ...attrs },
          slots,
        );
    },
  });
  return wrapper as C;
}
