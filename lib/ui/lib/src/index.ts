import './lib/assets/ui.scss';
import GridTable from './lib/components/GridTable/index.vue';
import * as DataTable from './lib/components/DataTable';
import type { Settings as GridTableSettings } from './lib/components/GridTable/types';
import type * as GridTableTypes from './lib/components/GridTable/types';
import type * as ManageModalTypes from './lib/components/ManageModal/types';
import ThemeSwitcher from './lib/components/ThemeSwitcher.vue';
import BtnPrimary from './lib/components/BtnPrimary.vue';
import BtnSecondary from './lib/components/BtnSecondary.vue';
import BtnAccent from './lib/components/BtnAccent.vue';
import BtnGhost from './lib/components/BtnGhost.vue';
import BtnLink from './lib/components/BtnLink.vue';
import TextField from './lib/components/TextField.vue';
import NumberInput from './lib/components/NumberInput.vue';
import SelectInput from './lib/components/SelectInput.vue';
import LineDropdown from './lib/components/LineDropdown.vue';
import MultiDropdown from './lib/components/MultiDropdown.vue';
import DropdownListItem from './lib/components/DropdownListItem.vue';
import BtnGroup from './lib/components/BtnGroup.vue';
import UiCheckbox from './lib/components/UiCheckbox.vue';
import Checkbox from './lib/components/Checkbox.vue';
import CheckboxGroup from './lib/components/CheckboxGroup.vue';
import WebCheckbox from './lib/components/WebCheckbox'; // experimental web component
import Chip from './lib/components/Chip.vue';
import Tooltip from './lib/components/Tooltip.vue';
import ToggleSwitch from './lib/components/ToggleSwitch.vue';
import MaskIcon from './lib/components/MaskIcon.vue';
import ContextProvider from './lib/components/ContextProvider.vue';
import Slider from './lib/components/Slider.vue';
import DialogModal from './lib/components/DialogModal.vue';
import SlideModal from './lib/components/SlideModal.vue';
import ManageModal from './lib/components/ManageModal/index.vue';
import { showContextMenu } from './lib/components/contextMenu/index.ts';
import { usePosition } from './lib/composition/usePosition';
import { useClickOutside } from './lib/composition/useClickOuside';
import { useEventListener } from './lib/composition/useEventListener';
import { useLabelNotch } from './lib/composition/useLabelNotch';
import { useScroll } from './lib/composition/useScroll';
import { useResizeObserver } from './lib/composition/useResizeObserver';
import { useTheme } from './lib/composition/useTheme';
import { useLocalStorage } from './lib/composition/useLocalStorage';
import { useMouseCapture } from './lib/composition/useMouseCapture';
import { useHover } from './lib/composition/useHover';
import { useMouse } from './lib/composition/useMouse';
import { useSortable } from './lib/composition/useSortable';
import { useInterval } from './lib/composition/useInterval';
import { useFormState } from './lib/composition/useFormState';
import { useQuery } from './lib/composition/useQuery.ts';

//for new version
import LongText from './lib/components/LongText.vue';
import SliderRangeTriple from './lib/components/SliderRangeTriple.vue';
import SliderRange from './lib/components/SliderRange.vue';
import Scrollable from './lib/components/Scrollable.vue';
import AddGraph from './lib/components/AddGraph.vue';
import { useDraggable } from './lib/composition/useDraggable';

// MiXCR
import AlphabetType from './lib/components/mixcr/AlphabetType.vue';
import AbundanceMeasure from './lib/components/mixcr/AbundanceMeasure.vue';
import AbundanceType from './lib/components/mixcr/AbundanceType.vue';
import GeneFeatureDropdown from './lib/components/mixcr/GeneFeatureDropdown/index.vue';
import GeneNameFormat from './lib/components/mixcr/GeneNameFormat.vue';
import GeneType from './lib/components/mixcr/GeneType.vue';
import MarkedSequence from './lib/components/mixcr/MarkedSequence.vue';

import icons16 from './lib/assets/icons/icons-16-generated.json';
import icons24 from './lib/assets/icons/icons-24-generated.json';

import { allCssVariables } from './lib/demo-site-data/all-css-variables.ts';

export type * from './lib/types';

export { maskIcons } from './lib/types';

export * from './lib/helpers/dom';

export { scrollIntoView } from './lib/helpers/dom';

export { animateInfinite } from './lib/helpers/utils';

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
