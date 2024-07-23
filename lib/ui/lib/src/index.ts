import './assets/ui.scss';
import GridTable from '@/components/GridTable/index.vue';
import * as DataTable from '@/components/DataTable';
import type { Settings as GridTableSettings } from './components/GridTable/types';
import type * as GridTableTypes from './components/GridTable/types';
import type * as ManageModalTypes from './components/ManageModal/types';
import ThemeSwitcher from './components/ThemeSwitcher.vue';
import BtnPrimary from './components/BtnPrimary.vue';
import BtnSecondary from './components/BtnSecondary.vue';
import BtnAccent from './components/BtnAccent.vue';
import BtnGhost from './components/BtnGhost.vue';
import BtnLink from './components/BtnLink.vue';
import TextField from './components/TextField.vue';
import NumberInput from './components/NumberInput.vue';
import SelectInput from './components/SelectInput.vue';
import LineDropdown from './components/LineDropdown.vue';
import MultiDropdown from './components/MultiDropdown.vue';
import DropdownListItem from './components/DropdownListItem.vue';
import BtnGroup from './components/BtnGroup.vue';
import UiCheckbox from './components/UiCheckbox.vue';
import Checkbox from './components/Checkbox.vue';
import CheckboxGroup from './components/CheckboxGroup.vue';
import WebCheckbox from './components/WebCheckbox'; // experimental web component
import Chip from './components/Chip.vue';
import Tooltip from './components/Tooltip.vue';
import ToggleSwitch from './components/ToggleSwitch.vue';
import MaskIcon from './components/MaskIcon.vue';
import ContextProvider from './components/ContextProvider.vue';
import Slider from './components/Slider.vue';
import DialogModal from './components/DialogModal.vue';
import SlideModal from './components/SlideModal.vue';
import ManageModal from './components/ManageModal/index.vue';
import { showContextMenu } from './components/contextMenu/index.ts';
import { usePosition } from './composition/usePosition';
import { useClickOutside } from './composition/useClickOuside';
import { useEventListener } from './composition/useEventListener';
import { useLabelNotch } from './composition/useLabelNotch';
import { useScroll } from './composition/useScroll';
import { useResizeObserver } from './composition/useResizeObserver';
import { useTheme } from './composition/useTheme';
import { useLocalStorage } from './composition/useLocalStorage';
import { useMouseCapture } from './composition/useMouseCapture';
import { useHover } from './composition/useHover';
import { useMouse } from './composition/useMouse';
import { useSortable } from './composition/useSortable';
import { useInterval } from './composition/useInterval';
import { useFormState } from './composition/useFormState';
import { useQuery } from './composition/useQuery.ts';

//for new version
import LongText from './components/LongText.vue';
import SliderRangeTriple from './components/SliderRangeTriple.vue';
import SliderRange from './components/SliderRange.vue';
import Scrollable from './components/Scrollable.vue';
import AddGraph from './components/AddGraph.vue';
import { useDraggable } from './composition/useDraggable';

// MiXCR
import AlphabetType from './components/mixcr/AlphabetType.vue';
import AbundanceMeasure from './components/mixcr/AbundanceMeasure.vue';
import AbundanceType from './components/mixcr/AbundanceType.vue';
import GeneFeatureDropdown from './components/mixcr/GeneFeatureDropdown/index.vue';
import GeneNameFormat from './components/mixcr/GeneNameFormat.vue';
import GeneType from './components/mixcr/GeneType.vue';
import MarkedSequence from './components/mixcr/MarkedSequence.vue';

import icons16 from './assets/icons/icons-16-generated.json';
import icons24 from './assets/icons/icons-24-generated.json';

import { allCssVariables } from './demo-site-data/all-css-variables.ts';

export type * from './types';

export { maskIcons } from './types';

export * from './helpers/dom';

export { scrollIntoView } from './helpers/dom';

export { animateInfinite } from './helpers/utils';

// MiXCR
export { AlphabetType, AbundanceMeasure, AbundanceType, GeneFeatureDropdown, GeneNameFormat, GeneType, MarkedSequence };

export {
  // Common
  NumberInput,
  ThemeSwitcher,
  BtnPrimary,
  BtnSecondary,
  BtnAccent,
  TextField,
  SelectInput,
  MultiDropdown,
  LineDropdown,
  DropdownListItem,
  BtnGroup,
  BtnGhost,
  BtnLink,
  UiCheckbox,
  WebCheckbox,
  Checkbox,
  CheckboxGroup,
  Chip,
  Tooltip,
  ToggleSwitch,
  MaskIcon,
  GridTable,
  DataTable,
  ContextProvider,
  Slider,
  DialogModal,
  SlideModal,
  ManageModal,
};

// Usables
export {
  useClickOutside,
  useEventListener,
  useLabelNotch,
  usePosition,
  useScroll,
  useResizeObserver,
  useTheme,
  useLocalStorage,
  useMouseCapture,
  useHover,
  useMouse,
  useSortable,
  useInterval,
  useFormState,
  useQuery,
};

// Helpers
export { showContextMenu };

// types
export type { GridTableSettings, GridTableTypes, ManageModalTypes };

//move to new version pl-uikit
export { LongText, SliderRangeTriple, SliderRange, Scrollable, AddGraph, useDraggable };

const DemoData = { allCssVariables: allCssVariables(), icons16, icons24 };
export { DemoData };
