import "./assets/ui.scss";

// @TODO review
import * as DataTable from "./components/DataTable/index.ts";
import ThemeSwitcher from "./components/ThemeSwitcher.vue";
// @TODO review (may be private)
import DropdownListItem from "./components/DropdownListItem.vue";

// @TODO review
import ContextProvider from "./components/ContextProvider.vue";
import Slider from "./components/Slider.vue";
import { showContextMenu } from "./components/contextMenu/index.ts";
// for new version
import LongText from "./components/LongText.vue";
import Scrollable from "./components/Scrollable.vue";
import SliderRange from "./components/SliderRange.vue";
import SliderRangeTriple from "./components/SliderRangeTriple.vue";

import { allCssVariables } from "./demo-site-data/all-css-variables.ts";

/**
 * Layout components
 */

export * from "./layout/PlBlockPage/index.ts";
export * from "./layout/PlContainer/index.ts";
export * from "./layout/PlGrid/index.ts";
export * from "./layout/PlPlaceholder/index.ts";
export * from "./layout/PlRow/index.ts";
export * from "./layout/PlSpacer/index.ts";

/**
 * Components
 */
export * from "./components/PlErrorBoundary/index.ts";
// export * from './components/PlErrorAlert'; // @TODO discuss if we should export it
export * from "./components/PlAccordion/index.ts";
export * from "./components/PlAlert/index.ts";
export * from "./components/PlAutocomplete/index.ts";
export * from "./components/PlAutocompleteMulti/index.ts";
export * from "./components/PlBtnAccent/index.ts";
export * from "./components/PlBtnDanger/index.ts";
export * from "./components/PlBtnGhost/index.ts";
export * from "./components/PlBtnGroup/index.ts";
export * from "./components/PlBtnLink/index.ts";
export * from "./components/PlBtnPrimary/index.ts";
export * from "./components/PlBtnSecondary/index.ts";
export * from "./components/PlBtnSplit/index.ts";
export * from "./components/PlCheckbox/index.ts";
export * from "./components/PlCheckboxGroup/index.ts";
export * from "./components/PlChip/index.ts";
export * from "./components/PlDialogModal/index.ts";
export * from "./components/PlDropdown/index.ts";
export * from "./components/PlDropdownLegacy/index.ts";
export * from "./components/PlDropdownLine/index.ts";
export * from "./components/PlDropdownMulti/index.ts";
export * from "./components/PlDropdownMultiRef/index.ts";
export * from "./components/PlDropdownRef/index.ts";
export * from "./components/PlEditableTitle/index.ts";
export * from "./components/PlElementList/index.ts";
export * from "./components/PlLoaderCircular/index.ts";
export * from "./components/PlLogView/index.ts";
export * from "./components/PlNumberField/index.ts";
export * from "./components/PlProgressBar/index.ts";
export * from "./components/PlProgressCell/index.ts";
export * from "./components/PlSearchField/index.ts";
export * from "./components/PlSectionSeparator/index.ts";
export * from "./components/PlSlideModal/index.ts";
export * from "./components/PlSplash/index.ts";
export * from "./components/PlStatusTag/index.ts";
export * from "./components/PlTabs/index.ts";
export * from "./components/PlTextArea/index.ts";
export * from "./components/PlTextField/index.ts";
export * from "./components/PlToggleSwitch/index.ts";
export * from "./components/PlTooltip/index.ts";

export * from "./components/PlFileDialog/index.ts";
export * from "./components/PlFileInput/index.ts";
export * from "./components/PlNotificationAlert/index.ts";

export * from "./components/PlSidebar/index.ts";

export * from "./components/PlIcon16/index.ts";
export * from "./components/PlIcon24/index.ts";
export * from "./components/PlMaskIcon16/index.ts";
export * from "./components/PlMaskIcon24/index.ts";
export * from "./components/PlSvg/index.ts";

export * from "./components/PlChartHistogram/index.ts";
export * from "./components/PlChartStackedBar/index.ts";

export * from "./components/PlRadio/index.ts";

export { default as PlLoaderLogo } from "./components/PlLoaderLogo.vue";

export * from "./colors/index.ts";

/**
 * Usables
 */
export { useClickOutside } from "./composition/useClickOutside.ts";
export { useComponentProp } from "./composition/useComponentProp.ts";
export { useConfirm } from "./composition/useConfirm.ts";
export { useDraggable } from "./composition/useDraggable.ts";
export { useEventListener } from "./composition/useEventListener.ts";
export { useFormState } from "./composition/useFormState.ts";
export { useHover } from "./composition/useHover.ts";
export { useInterval } from "./composition/useInterval.ts";
export { usePollingQuery } from "./composition/usePollingQuery.ts";
export { useLocalStorage } from "./composition/useLocalStorage.ts";
export { useMouse } from "./composition/useMouse.ts";
export { useMouseCapture } from "./composition/useMouseCapture.ts";
export { useElementPosition as usePosition } from "./composition/usePosition.ts";
export { useQuery } from "./composition/useQuery.ts";
export { useResizeObserver } from "./composition/useResizeObserver.ts";
export { useScroll } from "./composition/useScroll.ts";
export { useSortable } from "./composition/useSortable.ts";
export { useSortable2 } from "./composition/useSortable2.ts";
export { useTheme } from "./composition/useTheme.ts";

export * from "./composition/computedCached.ts";
export * from "./composition/filters/index.ts";
export * from "./composition/useWatchFetch.ts";
export * from "./composition/watchCached.ts";

/**
 * Utils/Partials
 */

export * from "./utils/DropdownOverlay/index.ts";
export { default as PlCloseModalBtn } from "./utils/PlCloseModalBtn.vue";

/**
 * Technical
 * @TODO move it from here maybe
 */
export { useLabelNotch } from "./utils/useLabelNotch.ts";

export type * from "./types.ts";

export { icons16, icons24 } from "./types.ts";

export * from "./helpers/dom.ts";

export * from "./helpers/utils.ts";

/**
 * @TODO review
 */
export { ContextProvider, DataTable, DropdownListItem, Slider, ThemeSwitcher };

// Helpers
export { showContextMenu };

// move to new version pl-uikit
export { LongText, Scrollable, SliderRange, SliderRangeTriple };

// @todo
const DemoData = { allCssVariables: allCssVariables() };
export { DemoData };
