import '@/lib/assets/ui.scss';
import GridTable from '@/lib/components/GridTable/index.vue';
import GeneFeatureDropdown from '@/lib/components/GeneFeatureDropdown/index.vue';
import type { Settings as GridTableSettings } from './lib/components/GridTable/types';
import type * as GridTableTypes from './lib/components/GridTable/types';
import ThemeSwitcher from '@/lib/components/ThemeSwitcher.vue';
import BtnPrimary from '@/lib/components/BtnPrimary.vue';
import BtnSecondary from '@/lib/components/BtnSecondary.vue';
import BtnAccent from '@/lib/components/BtnAccent.vue';
import BtnGhost from '@/lib/components/BtnGhost.vue';
import BtnLink from '@/lib/components/BtnLink.vue';
import TextField from '@/lib/components/TextField.vue';
import SelectInput from '@/lib/components/SelectInput.vue';
import MultiDropdown from '@/lib/components/MultiDropdown.vue';
import BtnGroup from '@/lib/components/BtnGroup.vue';
import UiCheckbox from '@/lib/components/UiCheckbox.vue';
import CheckboxGroup from '@/lib/components/CheckboxGroup.vue';
import WebCheckbox from '@/lib/components/WebCheckbox'; // experimental web component
import Chip from '@/lib/components/Chip.vue';
import Tooltip from '@/lib/components/Tooltip.vue';
import MaskIcon from '@/lib/components/MaskIcon.vue';
import ContextProvider from '@/lib/components/ContextProvider.vue';
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
import type { MaybeRef } from '@/lib/types.ts';

export {
  ThemeSwitcher,
  BtnPrimary,
  BtnSecondary,
  BtnAccent,
  TextField,
  SelectInput,
  MultiDropdown,
  BtnGroup,
  BtnGhost,
  BtnLink,
  UiCheckbox,
  WebCheckbox,
  CheckboxGroup,
  Chip,
  Tooltip,
  MaskIcon,
  GridTable,
  GeneFeatureDropdown,
  ContextProvider,
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
};

// types
export type { MaybeRef, GridTableSettings, GridTableTypes };
