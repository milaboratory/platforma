import "./assets/ui.scss";

// @TODO review
import * as DataTable from "./components/DataTable";
import ThemeSwitcher from "./components/ThemeSwitcher.vue";
// @TODO review (may be private)
import DropdownListItem from "./components/DropdownListItem.vue";

// @TODO review
import ContextProvider from "./components/ContextProvider.vue";
import Slider from "./components/Slider.vue";
import { showContextMenu } from "./components/contextMenu";
// for new version
import LongText from "./components/LongText.vue";
import Scrollable from "./components/Scrollable.vue";
import SliderRange from "./components/SliderRange.vue";
import SliderRangeTriple from "./components/SliderRangeTriple.vue";

import { allCssVariables } from "./demo-site-data/all-css-variables.ts";

/**
 * Layout components
 */

export * from "./layout/PlBlockPage";
export * from "./layout/PlContainer";
export * from "./layout/PlGrid";
export * from "./layout/PlPlaceholder";
export * from "./layout/PlRow";
export * from "./layout/PlSpacer";

/**
 * Components
 */
export * from "./components/PlErrorBoundary";
// export * from './components/PlErrorAlert'; // @TODO discuss if we should export it
export * from "./components/PlAccordion";
export * from "./components/PlAlert";
export * from "./components/PlAutocomplete";
export * from "./components/PlAutocompleteMulti";
export * from "./components/PlBtnAccent";
export * from "./components/PlBtnDanger";
export * from "./components/PlBtnGhost";
export * from "./components/PlBtnGroup";
export * from "./components/PlBtnLink";
export * from "./components/PlBtnPrimary";
export * from "./components/PlBtnSecondary";
export * from "./components/PlBtnSplit";
export * from "./components/PlCheckbox";
export * from "./components/PlCheckboxGroup";
export * from "./components/PlChip";
export * from "./components/PlDialogModal";
export * from "./components/PlDropdown";
export * from "./components/PlDropdownLegacy";
export * from "./components/PlDropdownLine";
export * from "./components/PlDropdownMulti";
export * from "./components/PlDropdownMultiRef";
export * from "./components/PlDropdownRef";
export * from "./components/PlEditableTitle";
export * from "./components/PlElementList";
export * from "./components/PlLoaderCircular";
export * from "./components/PlLogView";
export * from "./components/PlNumberField";
export * from "./components/PlProgressBar";
export * from "./components/PlProgressCell";
export * from "./components/PlSearchField";
export * from "./components/PlSectionSeparator";
export * from "./components/PlSlideModal";
export * from "./components/PlSplash";
export * from "./components/PlStatusTag";
export * from "./components/PlTabs";
export * from "./components/PlTextArea";
export * from "./components/PlTextField";
export * from "./components/PlToggleSwitch";
export * from "./components/PlTooltip";

export * from "./components/PlFileDialog";
export * from "./components/PlFileInput";
export * from "./components/PlNotificationAlert";

export * from "./components/PlSidebar";

export * from "./components/PlIcon16";
export * from "./components/PlIcon24";
export * from "./components/PlMaskIcon16";
export * from "./components/PlMaskIcon24";
export * from "./components/PlSvg";

export * from "./components/PlChartHistogram";
export * from "./components/PlChartStackedBar";

export * from "./components/PlRadio";

export { default as PlLoaderLogo } from "./components/PlLoaderLogo.vue";

export * from "./colors";

/**
 * Usables
 */
export { useClickOutside } from "./composition/useClickOutside";
export { useComponentProp } from "./composition/useComponentProp";
export { useConfirm } from "./composition/useConfirm";
export { useDraggable } from "./composition/useDraggable";
export { useEventListener } from "./composition/useEventListener";
export { useFormState } from "./composition/useFormState";
export { useHover } from "./composition/useHover";
export { useInterval } from "./composition/useInterval";
export { usePollingQuery } from "./composition/usePollingQuery";
export { useLocalStorage } from "./composition/useLocalStorage";
export { useMouse } from "./composition/useMouse";
export { useMouseCapture } from "./composition/useMouseCapture";
export { useElementPosition as usePosition } from "./composition/usePosition";
export { useQuery } from "./composition/useQuery.ts";
export { useResizeObserver } from "./composition/useResizeObserver";
export { useScroll } from "./composition/useScroll";
export { useSortable } from "./composition/useSortable";
export { useSortable2 } from "./composition/useSortable2";
export { useTheme } from "./composition/useTheme";

export * from "./composition/computedCached";
export * from "./composition/filters";
export * from "./composition/useWatchFetch";
export * from "./composition/watchCached";

/**
 * Utils/Partials
 */

export * from "./utils/DropdownOverlay";
export { default as PlCloseModalBtn } from "./utils/PlCloseModalBtn.vue";

/**
 * Technical
 * @TODO move it from here maybe
 */
export { useLabelNotch } from "./utils/useLabelNotch.ts";

export type * from "./types";

export { icons16, icons24 } from "./types";

export * from "./helpers/dom";

export * from "./helpers/utils";

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
