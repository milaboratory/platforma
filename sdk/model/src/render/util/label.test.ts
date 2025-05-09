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
  },
  {
    name: 'different importance and id',
    traces: [
      [{ type: 'sameType', importance: 10, id: 'id1', label: 'High importance' }],
      [{ type: 'sameType', importance: 5, id: 'id2', label: 'Low importance' }]
    ],
    labels: ['High importance', 'Low importance']
  },
  {
    name: 'mixed common and different entries',
    traces: [
      [
        { type: 'commonType', importance: 1, id: 'common', label: 'Common entry' },
        { type: 'uniqueType', importance: 10, id: 'id1', label: 'Unique entry 1' }
      ],
      [
        { type: 'commonType', importance: 1, id: 'common', label: 'Common entry' },
        { type: 'uniqueType', importance: 5, id: 'id2', label: 'Unique entry 2' }
      ]
    ],
    labels: ['Unique entry 1', 'Unique entry 2']
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

test.each<{ name: string; traces: Trace[]; labels: string[]; forceTraceElements: string[] }>([
  {
    name: 'force one element',
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
    labels: ['T1L1', 'T1L2'],
    forceTraceElements: ['t1']
  },
  {
    name: 'force multiple elements',
    traces: [
      [
        { type: 't1', label: 'T1L1' },
        { type: 't2', label: 'T2L1' },
        { type: 't3', label: 'T3L1' }
      ],
      [
        { type: 't1', label: 'T1L2' },
        { type: 't2', label: 'T2L2' },
        { type: 't3', label: 'T3L2' }
      ]
    ],
    labels: ['T1L1 / T3L1', 'T1L2 / T3L2'],
    forceTraceElements: ['t1', 't3']
  },
  {
    name: 'force element not in all traces',
    traces: [
      [
        { type: 't1', label: 'T1L1' },
        { type: 't2', label: 'T2L1' }
      ],
      [{ type: 't2', label: 'T2L2' }]
    ],
    labels: ['T1L1 / T2L1', 'T2L2'],
    forceTraceElements: ['t1']
  },
  {
    name: 'force element with includeNativeLabel',
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
    labels: ['T1L1', 'T1L2'],
    forceTraceElements: ['t1']
  }
])(
  'test label derivation with forceTraceElements: $name',
  ({ name, traces, labels, forceTraceElements }) => {
    expect(
      deriveLabels(tracesToSpecs(traces), (s) => s, { forceTraceElements }).map((r) => r.label)
    ).toEqual(labels);

    if (name === 'force element with includeNativeLabel') {
      expect(
        deriveLabels(tracesToSpecs(traces), (s) => s, {
          forceTraceElements,
          includeNativeLabel: true
        }).map((r) => r.label)
      ).toEqual(labels.map(l => 'Label / ' + l));
    }
  }
);
