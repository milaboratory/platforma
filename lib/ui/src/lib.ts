import '@/lib/assets/ui.scss';
import GridTable from '@/lib/components/GridTable/index.vue';
import DataTable from '@/lib/components/DataTable/index.vue';
import type { Settings as GridTableSettings } from './lib/components/GridTable/types';
import type { Settings as DataTableSettings } from './lib/components/DataTable/types';
import type * as GridTableTypes from './lib/components/GridTable/types';
import type * as DataTableTypes from './lib/components/DataTable/types';
import type * as ManageModalTypes from './lib/components/ManageModal/types';
import type { MaskIconName } from '@/lib/types.ts';
import ThemeSwitcher from '@/lib/components/ThemeSwitcher.vue';
import BtnPrimary from '@/lib/components/BtnPrimary.vue';
import BtnSecondary from '@/lib/components/BtnSecondary.vue';
import BtnAccent from '@/lib/components/BtnAccent.vue';
import BtnGhost from '@/lib/components/BtnGhost.vue';
import BtnLink from '@/lib/components/BtnLink.vue';
import TextField from '@/lib/components/TextField.vue';
import NumberInput from '@/lib/components/NumberInput.vue';
import SelectInput from '@/lib/components/SelectInput.vue';
import LineDropdown from '@/lib/components/LineDropdown.vue';
import MultiDropdown from '@/lib/components/MultiDropdown.vue';
import DropdownListItem from '@/lib/components/DropdownListItem.vue';
import BtnGroup from '@/lib/components/BtnGroup.vue';
import UiCheckbox from '@/lib/components/UiCheckbox.vue';
import Checkbox from '@/lib/components/Checkbox.vue';
import CheckboxGroup from '@/lib/components/CheckboxGroup.vue';
import WebCheckbox from '@/lib/components/WebCheckbox'; // experimental web component
import Chip from '@/lib/components/Chip.vue';
import Tooltip from '@/lib/components/Tooltip.vue';
import ToggleSwitch from '@/lib/components/ToggleSwitch.vue';
import MaskIcon from '@/lib/components/MaskIcon.vue';
import ContextProvider from '@/lib/components/ContextProvider.vue';
import Slider from '@/lib/components/Slider.vue';
import DialogModal from './lib/components/DialogModal.vue';
import SlideModal from './lib/components/SlideModal.vue';
import ManageModal from './lib/components/ManageModal/index.vue';
import { usePosition } from '@/lib/composition/usePosition';
import { useClickOutside } from '@/lib/composition/useClickOuside';
import { useEventListener } from '@/lib/composition/useEventListener';
import { useLabelNotch } from '@/lib/composition/useLabelNotch';
import { useScroll } from '@/lib/composition/useScroll';
import { useResizeObserver } from '@/lib/composition/useResizeObserver';
import { useTheme } from '@/lib/composition/useTheme';
import { useLocalStorage } from '@/lib/composition/useLocalStorage';
import { useMouseCapture } from '@/lib/composition/useMouseCapture';
import { useHover } from '@/lib/composition/useHover';
import { useMouse } from '@/lib/composition/useMouse';
import { useSortable } from './lib/composition/useSortable';
import { useInterval } from './lib/composition/useInterval';
import { useFormState } from './lib/composition/useFormState';
import { useQuery } from './lib/composition/useQuery.ts';
import type { MaybeRef } from '@/lib/types.ts';

//for new version
import LongText from '@/lib/components/LongText.vue';
import SliderRangeTriple from '@/lib/components/SliderRangeTriple.vue';
import SliderRange from '@/lib/components/SliderRange.vue';
import Scrollable from '@/lib/components/Scrollable.vue';
import AddGraph from '@/lib/components/AddGraph.vue';
import { useDraggable } from '@/lib/composition/useDraggable';

// MiXCR
import AlphabetType from '@/lib/components/mixcr/AlphabetType.vue';
import AbundanceMeasure from '@/lib/components/mixcr/AbundanceMeasure.vue';
import AbundanceType from '@/lib/components/mixcr/AbundanceType.vue';
import GeneFeatureDropdown from '@/lib/components/mixcr/GeneFeatureDropdown/index.vue';
import GeneNameFormat from '@/lib/components/mixcr/GeneNameFormat.vue';
import GeneType from '@/lib/components/mixcr/GeneType.vue';
import MarkedSequence from './lib/components/mixcr/MarkedSequence.vue';

// Layout
import SpaceKeeper from './lib/layout/SpaceKeeper.vue';
import FileInput from './lib/layout/FileInput.vue';
import EditableLabel from './lib/layout/EditableLabel.vue';
import BlockPane from './lib/layout/BlockPane.vue';
import BlockSection from './lib/layout/BlockSection.vue';
import BlockRow from './lib/layout/BlockRow.vue';
import BlockTitle from './lib/layout/BlockTitle.vue';
import BlockSubtitle from './lib/layout/BlockSubtitle.vue';
import HTabs from './lib/layout/HTabs.vue';
import TransitionSlidePanel from './lib/components/TransitionSlidePanel.vue';
import BtnClose from './lib/layout/BtnClose.vue';
import FileContentInput from './lib/layout/FileContentInput.vue';

import { BlockApp } from './lib/layout/BlockApp.ts';
import { useBlockInput } from './lib/layout/BlockApp.ts';
import { BlockStore } from './lib/layout/BlockStore.ts';

import icons16 from './lib/assets/icons/icons-16-generated.json';
import icons24 from './lib/assets/icons/icons-24-generated.json';

import { allCssVariables } from './lib/demo-site-data/all-css-variables.ts';

// MiXCR
export { AlphabetType, AbundanceMeasure, AbundanceType, GeneFeatureDropdown, GeneNameFormat, GeneType, MarkedSequence };

export {
  // Common
  ThemeSwitcher,
  BtnPrimary,
  BtnSecondary,
  BtnAccent,
  TextField,
  NumberInput,
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
  // Usables
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

// Layout
export {
  SpaceKeeper,
  FileInput,
  FileContentInput,
  EditableLabel,
  BlockPane,
  BlockSection,
  BlockRow,
  BlockTitle,
  BlockSubtitle,
  HTabs,
  TransitionSlidePanel,
  BtnClose,
  BlockApp,
  BlockStore,
  useBlockInput,
};

// types
export type { MaybeRef, GridTableSettings, DataTableSettings, GridTableTypes, DataTableTypes, ManageModalTypes, MaskIconName };

//move to new version pl-uikit
export { LongText, SliderRangeTriple, SliderRange, Scrollable, AddGraph, useDraggable };

const DemoData = { allCssVariables: allCssVariables(), icons16, icons24 };
export { DemoData };
