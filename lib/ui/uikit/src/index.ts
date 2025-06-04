import './assets/ui.scss';

// @TODO review
import * as DataTable from '@/components/DataTable';
import ThemeSwitcher from './components/ThemeSwitcher.vue';

/**
 * Layout components
 */

export * from './layout/PlBlockPage';
export * from './layout/PlContainer';
export * from './layout/PlRow';
export * from './layout/PlSpacer';
export * from './layout/PlGrid';

/**
 * Components
 */
export * from './components/PlErrorBoundary';
export * from './components/PlErrorAlert';
export * from './components/PlAlert';
export * from './components/PlBtnSplit';
export * from './components/PlBtnPrimary';
export * from './components/PlBtnAccent';
export * from './components/PlBtnDanger';
export * from './components/PlBtnSecondary';
export * from './components/PlBtnGhost';
export * from './components/PlBtnLink';
export * from './components/PlBtnGroup';
export * from './components/PlEditableTitle';
export * from './components/PlTextField';
export * from './components/PlSearchField';
export * from './components/PlTextArea';
export * from './components/PlDropdown';
export * from './components/PlDropdownRef';
export * from './components/PlDropdownLine';
export * from './components/PlDropdownLegacy';
export * from './components/PlTooltip';
export * from './components/PlProgressBar';
export * from './components/PlNumberField';
export * from './components/PlDropdownMulti';
export * from './components/PlDropdownMultiRef';
export * from './components/PlCheckbox';
export * from './components/PlCheckboxGroup';
export * from './components/PlChip';
export * from './components/PlDialogModal';
export * from './components/PlSlideModal';
export * from './components/PlToggleSwitch';
export * from './components/PlLogView';
export * from './components/PlTabs';
export * from './components/PlSectionSeparator';
export * from './components/PlAccordion';
export * from './components/PlStatusTag';
export * from './components/PlLoaderCircular';
export * from './components/PlSplash';
export * from './components/PlProgressCell';
export * from './components/PlAutocomplete';

export * from './components/PlFileDialog';
export * from './components/PlFileInput';
export * from './components/PlNotificationAlert';

export * from './components/PlMaskIcon16';
export * from './components/PlMaskIcon24';
export * from './components/PlIcon16';
export * from './components/PlIcon24';

export * from './components/PlChartStackedBar';
export * from './components/PlChartHistogram';

export * from './components/PlRadio';

export * from './colors';

// @TODO review (may be private)
import DropdownListItem from './components/DropdownListItem.vue';

// @TODO review
import ContextProvider from './components/ContextProvider.vue';
import Slider from './components/Slider.vue';
import { showContextMenu } from './components/contextMenu/index.ts';

/**
 * Usables
 */
export { useElementPosition as usePosition } from './composition/usePosition';
export { useClickOutside } from './composition/useClickOutside';
export { useEventListener } from './composition/useEventListener';
export { useScroll } from './composition/useScroll';
export { useResizeObserver } from './composition/useResizeObserver';
export { useTheme } from './composition/useTheme';
export { useLocalStorage } from './composition/useLocalStorage';
export { useMouseCapture } from './composition/useMouseCapture';
export { useHover } from './composition/useHover';
export { useMouse } from './composition/useMouse';
export { useSortable } from './composition/useSortable';
export { useSortable2 } from './composition/useSortable2';
export { useInterval } from './composition/useInterval';
export { useFormState } from './composition/useFormState';
export { useQuery } from './composition/useQuery.ts';
export { useDraggable } from './composition/useDraggable';
export { useComponentProp } from './composition/useComponentProp';
export * from './composition/useWatchFetch';

/**
 * Utils/Partials
 */

export { default as PlCloseModalBtn } from './utils/PlCloseModalBtn.vue';
export * from './utils/DropdownOverlay';

/**
 * Technical
 * @TODO move it from here maybe
 */
export { useLabelNotch } from './utils/useLabelNotch.ts';

// for new version
import LongText from './components/LongText.vue';
import SliderRangeTriple from './components/SliderRangeTriple.vue';
import SliderRange from './components/SliderRange.vue';
import Scrollable from './components/Scrollable.vue';

import icons16 from './assets/icons/icons-16-generated.json';
import icons24 from './assets/icons/icons-24-generated.json';

import { allCssVariables } from './demo-site-data/all-css-variables.ts';

export type * from './types';

export { maskIcons16, maskIcons24 } from './types';

export * from './helpers/dom';

export * from './helpers/utils';

/**
 * @TODO review
 */
export { ThemeSwitcher, DropdownListItem, DataTable, ContextProvider, Slider };

// Helpers
export { showContextMenu };

// move to new version pl-uikit
export { LongText, SliderRangeTriple, SliderRange, Scrollable };

// @todo
const DemoData = { allCssVariables: allCssVariables(), icons16, icons24 };
export { DemoData };
