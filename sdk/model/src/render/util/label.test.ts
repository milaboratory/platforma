import { test, expect } from '@jest/globals';
import { deriveLabels, PAnnotationLabel, PAnnotationTrace, Trace } from './label';
import { PColumnSpec } from '@milaboratories/pl-model-common';

function tracesToSpecs(traces: Trace[]) {
  return traces.map(
    (t) =>
      ({
        kind: 'PColumn',
        name: 'name',
        valueType: 'Int',
        annotations: {
          [PAnnotationTrace]: JSON.stringify(t),
          [PAnnotationLabel]: 'Label'
        },
        axesSpec: []
      }) satisfies PColumnSpec
  );
}
test.each<{ name: string; traces: Trace[]; labels: string[] }>([
  {
    name: 'simple',
    traces: [[{ type: 't1', label: 'L1' }], [{ type: 't1', label: 'L2' }]],
    labels: ['L1', 'L2']
  },
  {
    name: 'later wins',
    traces: [
      [
        { type: 't1', label: 'T1L1' },
        { type: 't2', label: 'T2L1' }
      ],
      [
        { type: 't1', label: 'T1L2' },
        { type: 't2', label: 'T2L2' }
      ]
    ],
    labels: ['T2L1', 'T2L2']
  },
  {
    name: 'importance wins',
    traces: [
      [
        { type: 't1', importance: 100, label: 'T1L1' },
        { type: 't2', label: 'T2L1' }
      ],
      [
        { type: 't1', importance: 100, label: 'T1L2' },
        { type: 't2', label: 'T2L2' }
      ]
    ],
    labels: ['T1L1', 'T1L2']
  },
  {
    name: 'uniqueness wins',
    traces: [
      [
        { type: 't1', label: 'T1L1' },
        { type: 't2', label: 'T2L1' }
      ],
      [
        { type: 't1', label: 'T1L2' },
        { type: 't2', label: 'T2L1' }
      ]
    ],
    labels: ['T1L1', 'T1L2']
  },
  {
    name: 'combinatoric solution',
    traces: [
      [
        { type: 't1', label: 'T1L1' },
        { type: 't2', label: 'T2L1' }
      ],
      [
        { type: 't1', label: 'T1L1' },
        { type: 't2', label: 'T2L2' }
      ],
      [
        { type: 't1', label: 'T1L2' },
        { type: 't2', label: 'T2L2' }
      ]
    ],
    labels: ['T1L1 / T2L1', 'T1L1 / T2L2', 'T1L2 / T2L2']
  }
])('test label derivation: $name', ({ name, traces, labels }) => {
  expect(deriveLabels(tracesToSpecs(traces), (s) => s).map((r) => r.label)).toEqual(labels);
  expect(
    deriveLabels(tracesToSpecs(traces), (s) => s, { includeNativeLabel: true }).map((r) => r.label)
  ).toEqual(labels.map((l) => 'Label / ' + l));
});

test('test fallback to native labels in label derivation', () => {
  expect(deriveLabels(tracesToSpecs([[], []]), (s) => s).map((r) => r.label)).toEqual([
    'Label',
    'Label'
  ]);
});
