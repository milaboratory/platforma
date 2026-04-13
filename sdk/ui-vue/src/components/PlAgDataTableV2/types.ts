import type {
  AxesSpec,
  AxisId,
  PTableColumnSpec,
  PTableKey,
  PlTableColumnIdJson,
} from "@platforma-sdk/model";
import type { ColDef, IServerSideDatasource } from "ag-grid-enterprise";
import type { PTableHidden } from "../PlAgDataTable/sources/common";
import type { PlAgDataTableV2Row } from "../PlAgDataTable/types";
import type { PTableValue } from "@platforma-sdk/model";

// ── Settings machine states ─────────────────────────────────────────────

export type SettingsStateNoSource = {
  readonly kind: "no-source";
  readonly pending: boolean;
};

export type SettingsStateSourceChanged = {
  readonly kind: "source-changed";
  readonly sourceId: string;
};

export type SettingsStateModelPending = {
  readonly kind: "model-pending";
  readonly sourceId: string;
};

export type SettingsStateModelReady = {
  readonly kind: "model-ready";
  readonly sourceId: string;
};

export type SettingsState =
  | SettingsStateNoSource
  | SettingsStateSourceChanged
  | SettingsStateModelPending
  | SettingsStateModelReady;

// ── Column pipeline result ──────────────────────────────────────────────

export type ColumnPipelineResult = {
  readonly columnDefs: ColDef<PlAgDataTableV2Row, PTableValue | PTableHidden>[];
  readonly datasource: IServerSideDatasource<PlAgDataTableV2Row>;
  readonly axesSpec: AxesSpec;
  readonly filterableColumns: PTableColumnSpec[];
  readonly visibleFilterableColumns: PTableColumnSpec[];
};

// ── Index mapping ───────────────────────────────────────────────────────

export type IndexMapping = {
  /** Indices into full spec array that correspond to displayed fields */
  readonly fields: number[];
  /** Indices into full spec array to use for data requests (may differ from fields due to label replacement) */
  readonly indices: number[];
  /** Map from full spec index to visible spec index (-1 if hidden) */
  readonly specsToVisibleMapping: Map<number, number>;
  /** Indices of axis columns in the visible spec */
  readonly visibleAxesIndices: number[];
};

// ── Overlay types ───────────────────────────────────────────────────────

export type OverlayVariant = "not-ready" | "running" | "loading";

export type OverlayTexts = {
  loadingText?: string;
  runningText?: string;
  notReadyText?: string;
  noRowsText?: string;
};

// ── Cell button params ──────────────────────────────────────────────────

export type CellButtonAxisParameters = {
  readonly showCellButtonForAxisId?: AxisId;
  readonly cellButtonInvokeRowsOnDoubleClick?: boolean;
  readonly trigger: (key?: PTableKey) => void;
};

// ── Datasource builder context ──────────────────────────────────────────

export type DatasourceContext = {
  readonly fields: number[];
  readonly requestIndices: number[];
  readonly fieldResultMapping: number[];
  readonly axesResultIndices: number[];
  readonly hiddenColIds: PlTableColumnIdJson[] | undefined;
};
