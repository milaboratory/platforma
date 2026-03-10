import type {
  PColumn,
  PColumnIdAndSpec,
  PColumnKey,
  PColumnValues,
  PObjectId,
  PTableColumnId,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  isPTableAbsent,
  PColumnName,
  stringifyJson,
  uniquePlId,
  ValueType,
} from "@milaboratories/pl-model-common";
import type { PlSelectionModel } from "./PlSelectionModel";

export type PColumnPredicate = (column: PColumnIdAndSpec) => boolean | { default: boolean };

export interface PlMultiSequenceAlignmentSettings {
  sequenceColumnIds?: PObjectId[];
  labelColumnIds?: PTableColumnId[];
  colorScheme: PlMultiSequenceAlignmentColorSchemeOption;
  widgets: PlMultiSequenceAlignmentWidget[];
  alignmentParams: {
    gpo: number;
    gpe: number;
    tgpe: number;
  };
}

export type PlMultiSequenceAlignmentWidget = "consensus" | "seqLogo" | "tree" | "legend";

export interface PlMultiSequenceAlignmentModel extends Partial<PlMultiSequenceAlignmentSettings> {
  version?: number;
}

export type PlMultiSequenceAlignmentColorSchemeOption =
  | { type: "no-color" }
  | { type: "chemical-properties" }
  | { type: "markup"; columnIds: PObjectId[] };

export function createRowSelectionColumn({
  selection,
  columnId = uniquePlId() as string as PObjectId,
  label = "Selection marker",
  domain,
}: {
  selection: PlSelectionModel | undefined;
  columnId?: PObjectId;
  label?: string;
  domain?: Record<string, string>;
}): PColumn<PColumnValues> | undefined {
  if (!selection?.axesSpec.length) {
    return;
  }
  const data: PColumnValues = selection.selectedKeys
    .filter((r): r is PColumnKey => r.every((v) => !isPTableAbsent(v)))
    .map((r) => ({ key: r, val: 1 }));
  if (!data.length) {
    return;
  }
  return {
    id: columnId,
    spec: {
      kind: "PColumn",
      valueType: ValueType.Int,
      name: PColumnName.Table.RowSelection,
      axesSpec: selection.axesSpec,
      ...(domain && Object.keys(domain).length && { domain }),
      annotations: {
        [Annotation.Label]: label,
        [Annotation.DiscreteValues]: stringifyJson([1]),
      } satisfies Annotation,
    },
    data,
  };
}
