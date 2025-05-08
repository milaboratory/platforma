import type { PObjectSpec } from '@milaboratories/pl-model-common';
import { z } from 'zod';

export const PAnnotationLabel = 'pl7.app/label';
export const PAnnotationTrace = 'pl7.app/trace';

export type RecordsWithLabel<T> = {
  value: T;
  label: string;
};

export type LabelDerivationOps = {
  /** Force inclusion of native column label */
  includeNativeLabel?: boolean;
  /** Separator to use between label parts (" / " by default) */
  separator?: string;
  /** If true, label will be added as suffix (at the end of the generated label). By default label added as a prefix. */
  addLabelAsSuffix?: boolean;
  /** Trace elements list that will be forced to be included in the label. */
  forceTraceElements?: string[];
};

export const TraceEntry = z.object({
  type: z.string(),
  importance: z.number().optional(),
  id: z.string().optional(),
  label: z.string(),
});
export type TraceEntry = z.infer<typeof TraceEntry>;
type FullTraceEntry = TraceEntry & { fullType: string; occurrenceIndex: number };

export const Trace = z.array(TraceEntry);
export type Trace = z.infer<typeof Trace>;
type FullTrace = FullTraceEntry[];

// Define the possible return types for the specExtractor function
type SpecExtractorResult = PObjectSpec | {
  spec: PObjectSpec;
  prefixTrace?: TraceEntry[];
  suffixTrace?: TraceEntry[];
};

const DistancePenalty = 0.001;

const LabelType = '__LABEL__';
const LabelTypeFull = '__LABEL__@1';

export function deriveLabels<T>(
  values: T[],
  specExtractor: (obj: T) => SpecExtractorResult,
  ops: LabelDerivationOps = {},
): RecordsWithLabel<T>[] {
  const importances = new Map<string, number>();

  const forceTraceElements = (ops.forceTraceElements !== undefined && ops.forceTraceElements.length > 0)
    ? new Set(ops.forceTraceElements)
    : undefined;

  // number of times certain type occurred among all of the
  const numberOfRecordsWithType = new Map<string, number>();

  const enrichedRecords = values.map((value) => {
    const extractorResult = specExtractor(value);
    let spec: PObjectSpec;
    let prefixTrace: TraceEntry[] | undefined;
    let suffixTrace: TraceEntry[] | undefined;

    // Check if the result is the new structure or just PObjectSpec
    if ('spec' in extractorResult && typeof extractorResult.spec === 'object') {
      // It's the new structure { spec, prefixTrace?, suffixTrace? }
      spec = extractorResult.spec;
      prefixTrace = extractorResult.prefixTrace;
      suffixTrace = extractorResult.suffixTrace;
    } else {
      // It's just PObjectSpec
      spec = extractorResult as PObjectSpec;
    }

    const label = spec.annotations?.[PAnnotationLabel];
    const traceStr = spec.annotations?.[PAnnotationTrace];
    const baseTrace = (traceStr ? Trace.safeParse(JSON.parse(traceStr)).data : undefined) ?? [];

    const trace = [
      ...(prefixTrace ?? []),
      ...baseTrace,
      ...(suffixTrace ?? []),
    ];

    if (label !== undefined) {
      const labelEntry = { label, type: LabelType, importance: -2 };
      if (ops.addLabelAsSuffix) trace.push(labelEntry);
      else trace.splice(0, 0, labelEntry);
    }

    const fullTrace: FullTrace = [];

    const occurrences = new Map<string, number>();
    for (let i = trace.length - 1; i >= 0; --i) {
      const { type: typeName } = trace[i];
      const importance = trace[i].importance ?? 0;
      const occurrenceIndex = (occurrences.get(typeName) ?? 0) + 1;
      occurrences.set(typeName, occurrenceIndex);
      const fullType = `${typeName}@${occurrenceIndex}`;
      numberOfRecordsWithType.set(fullType, (numberOfRecordsWithType.get(fullType) ?? 0) + 1);
      importances.set(
        fullType,
        Math.max(
          importances.get(fullType) ?? Number.NEGATIVE_INFINITY,
          importance - (trace.length - i) * DistancePenalty,
        ),
      );
      fullTrace.push({ ...trace[i], fullType, occurrenceIndex: occurrenceIndex });
    }
    fullTrace.reverse();
    return {
      value,
      spec,
      label,
      fullTrace,
    };
  });

  // excluding repeated types (i.e. ..@2, ..@3, etc.) not found in some records
  const mainTypes: string[] = [];
  // repeated types (i.e. ..@2, ..@3, etc.) not found in some records
  const secondaryTypes: string[] = [];

  const allTypeRecords = [...importances];
  // sorting: most important types go first
  allTypeRecords.sort(([, i1], [, i2]) => i2 - i1);

  for (const [typeName] of allTypeRecords) {
    if (typeName.endsWith('@1') || numberOfRecordsWithType.get(typeName) === values.length)
      mainTypes.push(typeName);
    else secondaryTypes.push(typeName);
  }

  const calculate = (includedTypes: Set<string>, force: boolean = false) => {
    const result: RecordsWithLabel<T>[] = [];
    for (let i = 0; i < enrichedRecords.length; i++) {
      const r = enrichedRecords[i];
      const includedTrace = r.fullTrace
        .filter((fm) => includedTypes.has(fm.fullType)
          || (forceTraceElements && forceTraceElements.has(fm.type)));
      if (includedTrace.length === 0) {
        if (force)
          result.push({
            label: 'Unlabeled',
            value: r.value,
          } satisfies RecordsWithLabel<T>);
        else return undefined;
      }
      const labelSet = includedTrace
        .map((fm) => fm.label);
      const sep = ops.separator ?? ' / ';
      result.push({
        label: labelSet.join(sep),
        value: r.value,
      } satisfies RecordsWithLabel<T>);
    }
    return result;
  };

  if (mainTypes.length === 0) {
    if (secondaryTypes.length !== 0) throw new Error('Non-empty secondary types list while main types list is empty.');
    return calculate(new Set(LabelTypeFull), true)!;
  }

  //
  // includedTypes = 2
  // *  *
  // T0 T1 T2 T3 T4 T5
  //          *
  // additionalType = 3
  //
  // Resulting set: T0, T1, T3
  //
  let includedTypes = 0;
  let additionalType = -1;
  while (includedTypes < mainTypes.length) {
    const currentSet = new Set<string>();
    if (ops.includeNativeLabel) currentSet.add(LabelTypeFull);
    for (let i = 0; i < includedTypes; ++i) currentSet.add(mainTypes[i]);
    if (additionalType >= 0)
      currentSet.add(mainTypes[additionalType]);

    const candidateResult = calculate(currentSet);

    // checking if labels uniquely separate our records
    if (candidateResult !== undefined && new Set(candidateResult.map((c) => c.label)).size === values.length) return candidateResult;

    additionalType++;
    if (additionalType >= mainTypes.length) {
      includedTypes++;
      additionalType = includedTypes;
    }
  }

  return calculate(new Set([...mainTypes, ...secondaryTypes]), true)!;
}
