/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ColDef, ICellRendererParams } from 'ag-grid-enterprise';
import { PlAgCellProgress } from '../components/PlAgCellProgress';
import type { MaskIconName16, PlProgressCellProps } from '@milaboratories/uikit';
import { tapIf } from '@milaboratories/helpers';
import type { PlAgHeaderComponentParams } from '../lib';
import { PlAgColumnHeader } from '../components/PlAgColumnHeader';
import { PlAgTextAndButtonCell } from '../components/PlAgTextAndButtonCell';

/**
 * Represents the available progress statuses for a cell.
 */
type ProgressStatus = 'not_started' | 'running' | 'done';

/**
 * Human-readable labels for each {@link ProgressStatus}.
 */
const progressStatusLabels: Record<ProgressStatus, string> = {
  not_started: 'Not Started',
  running: 'Running',
  done: 'Done',
};

/**
 * Defines the configuration for rendering a progress overlay in a grid cell.
 *
 * When provided, a progress overlay will be rendered. If the value is
 * `undefined`, no progress overlay is shown.
 */
export type ColDefProgress = {
  /**
   * The progress status which influences default text and styling:
   *   - `'not_started'`: Typically renders gray text without a progress bar.
   *   - `'running'`: Indicates an active progress state.
   *   - `'done'`: Implies completion (commonly rendered as 100%).
   */
  status: ProgressStatus;
  /**
   * A number (or numeric string) between 0 and 100 that indicates progress.
   * If omitted or invalid, it implies an infinite or indeterminate progress state
   */
  percent?: number | string;
  /**
   * The main label displayed on the left side of the cell.
   */
  text?: string;
  /**
   * Additional text, often used to display the percentage by default.
   */
  suffix?: string;
  /**
   * If provided, this message takes precedence over `text` to indicate an error.
   */
  error?: string;
} | undefined;

/**
 * Callback function type to dynamically generate a {@link ColDefProgress} configuration
 * for a cell based on its rendering parameters.
 *
 * @typeParam TData - The type of the row data.
 * @typeParam TValue - The type of the cell value.
 *
 * @param cellData - The parameters provided by AG Grid's cell renderer.
 * @returns A {@link ColDefProgress} object to configure the progress overlay,
 *          or `undefined` if no progress overlay should be rendered.
 */
export type ColDefProgressCallback<TData = any, TValue = any> = (
  value: TValue,
  cellData: ICellRendererParams<TData, TValue>
) => ColDefProgress;

/**
 * Extended AG Grid column definition that supports additional properties for
 * progress overlays and layout customization.
 *
 * @typeParam TData - The type of the row data.
 * @typeParam TValue - The type of the cell value.
 *
 * @property progress - An optional callback to provide progress overlay configuration.
 * @property noGutters - If `true`, removes padding from the cell.
 */
export interface ColDefExtended<TData, TValue = any> extends ColDef<TData, TValue> {
  progress?: ColDefProgressCallback<TData, TValue>;
  noGutters?: boolean;
  headerComponentParams?: PlAgHeaderComponentParams;
  textWithButton?: true | {
    /**
     * Button icon MaskIconName16
     */
    icon?: MaskIconName16;
    /**
     * Button label
     */
    btnLabel?: string;
    /**
     * If invokeRowsOnDoubleClick = true, clicking a button inside the row
     * triggers the doubleClick event for the entire row. In this case,
     * the handler passed to the component is not called, even if it is defined.
     *
     * If invokeRowsOnDoubleClick = false, the doubleClick event for the row
     * is not triggered, but the provided handler will be called, receiving
     * the ICellRendererParams as an argument.
     */
    invokeRowsOnDoubleClick?: boolean;
    /**
     * plHandler parameter is a click handler that is invoked when
     * the invokeRowsOnDoubleClick property is set to false.
     */
    onClick?: (params: ICellRendererParams) => void;
  };
}

/**
 * Utility type to infer the type of a specific property key from a {@link ColDefExtended}. Maybe not useful
 */
export type InferColDefKey<TData, TValue, K extends keyof ColDefExtended<TData, TValue>> = ColDefExtended<TData, TValue>[K];

/**
 * Returns a style object that removes horizontal and vertical padding from an AG Grid cell.
 */
function noGuttersStyle() {
  return {
    '--ag-cell-horizontal-padding': '0px',
    '--ag-cell-vertical-padding': '0px',
  };
}

/**
 * Creates the configuration object for a progress cell renderer component.
 *
 * @param params - The properties for the progress cell component, conforming to {@link PlProgressCellProps}.
 * @returns An object containing the progress component and its parameters.
 */
function createProgressComponent(params: PlProgressCellProps) {
  return {
    component: PlAgCellProgress,
    params,
  };
}

/**
 * Enhances the given column definition to support a progress overlay if a progress callback is provided.
 *
 * This function modifies the column definition by:
 * - Merging no-gutters styles into the cell style.
 * - Overriding the `cellRendererSelector` to return a progress component when a valid progress configuration is present.
 *
 * @typeParam TData - The type of the row data.
 * @param def - The extended column definition to be augmented.
 */
function handleProgress<TData>(def: ColDefExtended<TData>) {
  if (def.progress) {
    const progress = def.progress;

    const cellRendererSelector = def.cellRendererSelector;

    // Ensure no padding in the cell when a progress overlay is rendered.
    def.cellStyle = Object.assign({}, def.cellStyle ?? {}, noGuttersStyle());

    def.cellRendererSelector = (cellData) => {
      const pt = progress(cellData.value, cellData);

      if (!pt) {
        return cellRendererSelector?.(cellData);
      }

      return createProgressComponent({
        progress: tapIf(Number(pt.percent), (n) => Number.isFinite(n) ? (n < 0 ? 0 : n) : undefined),
        progressString: pt.suffix ?? (pt.status === 'running' ? `${pt.percent ?? 0}%` : ''),
        step: pt.text ?? progressStatusLabels[pt.status],
        stage: pt.status,
        error: pt.error,
      });
    };
  }
}

/**
 * Creates an AG Grid column definition with extended features such as progress overlays and gutter removal.
 *
 * This function processes an extended column definition by:
 * - Applying progress rendering logic via {@link handleProgress} if a progress callback is provided.
 * - Merging no-gutters styles if the `noGutters` flag is set.
 * - Removing the internal properties (`progress` and `noGutters`) from the final definition.
 *
 * @typeParam TData - The type of the row data.
 * @typeParam TValue - The type of the cell value.
 * @param def - The extended column definition containing custom properties.
 * @returns The processed column definition ready for use with AG Grid.
 */
export function createAgGridColDef<TData, TValue = any>(def: ColDefExtended<TData, TValue>): ColDef<TData, TValue> {
  handleProgress(def);

  if (def.noGutters) {
    def.cellStyle = Object.assign({}, def.cellStyle ?? {}, noGuttersStyle());
  }

  if (def.headerComponentParams) {
    def.headerComponent = PlAgColumnHeader;
  }

  if (def.textWithButton) {
    def.cellRenderer = PlAgTextAndButtonCell;
    if (typeof def.textWithButton !== 'boolean') {
      def.cellRendererParams = def.textWithButton;
    } else {
      def.cellRendererParams = {
        invokeRowsOnDoubleClick: true,
      };
    }
  }

  delete def.textWithButton;

  delete def.progress;

  delete def.noGutters;

  return def;
}
