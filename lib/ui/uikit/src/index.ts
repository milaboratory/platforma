import './assets/ui.scss';

// @TODO review
import GridTable from '@/components/GridTable/index.vue';
import * as DataTable from '@/components/DataTable';
import type { Settings as GridTableSettings } from './components/GridTable/types';
import type * as GridTableTypes from './components/GridTable/types';
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
export * from './components/PlAlert';
export * from './components/PlBtnPrimary';
export * from './components/PlBtnAccent';
export * from './components/PlBtnSecondary';
export * from './components/PlBtnGhost';
export * from './components/PlBtnLink';
export * from './components/PlBtnGroup';
export * from './components/PlTextField';
export * from './components/PlTextArea';
export * from './components/PlDropdown';
export * from './components/PlDropdownLine';
export * from './components/PlTooltip';
export * from './components/PlProgressBar';
export * from './components/PlNumberField';
export * from './components/PlDropdownMulti';
export * from './components/PlCheckbox';
export * from './components/PlCheckboxGroup';
export * from './components/PlChip';
export * from './components/PlDialogModal';
export * from './components/PlSlideModal';
export * from './components/PlToggleSwitch';

export * from './components/PlFileDialog';
export * from './components/PlFileInput';

// @TODO review (may be private)
import DropdownListItem from './components/DropdownListItem.vue';

// @TODO review
import MaskIcon16 from './components/MaskIcon16.vue';
import MaskIcon24 from './components/MaskIcon24.vue';
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
export { useInterval } from './composition/useInterval';
export { useFormState } from './composition/useFormState';
export { useQuery } from './composition/useQuery.ts';
export { useDraggable } from './composition/useDraggable';

/**
 * Technical
 * @TODO move it from here maybe
 */
export { useLabelNotch } from './utils/useLabelNotch.ts';

//for new version
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
export { ThemeSwitcher, DropdownListItem, MaskIcon16, MaskIcon24, GridTable, DataTable, ContextProvider, Slider };

// Helpers
export { showContextMenu };

// types
export type { GridTableSettings, GridTableTypes };

//move to new version pl-uikit
export { LongText, SliderRangeTriple, SliderRange, Scrollable };

// @todo
const DemoData = { allCssVariables: allCssVariables(), icons16, icons24 };
export { DemoData };
