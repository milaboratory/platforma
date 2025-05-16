import { test } from 'vitest';
import { highlightAlignment } from '../utils/colors';

test('highlightAlignment correctly assigns colors to columns in an alignment', ({ expect }) => {
  const sequences = [
    'ARK-G',
    'AKK-A',
    'RRK-G',
  ];
  const expectedHighlight = [
    // Sequence 1: 'ARK-G'
    [
      { residue: 'A', position: 0, color: 'hydrophobic' },
      { residue: 'R', position: 1, color: 'positive_charge' },
      { residue: 'K', position: 2, color: 'positive_charge' },
      { residue: '-', position: 3, color: 'unconserved_or_default' },
      { residue: 'G', position: 4, color: 'glycine' },
    ],
    // Sequence 2: 'AKK-A'
    [
      { residue: 'A', position: 0, color: 'hydrophobic' },
      { residue: 'K', position: 1, color: 'positive_charge' },
      { residue: 'K', position: 2, color: 'positive_charge' },
      { residue: '-', position: 3, color: 'unconserved_or_default' },
      { residue: 'A', position: 4, color: 'unconserved_or_default' },
    ],
    // Sequence 3: 'RRK-G'
    [
      { residue: 'R', position: 0, color: 'unconserved_or_default' },
      { residue: 'R', position: 1, color: 'positive_charge' },
      { residue: 'K', position: 2, color: 'positive_charge' },
      { residue: '-', position: 3, color: 'unconserved_or_default' },
      { residue: 'G', position: 4, color: 'glycine' },
    ],
  ];
  expect(highlightAlignment(sequences)).toEqual(expectedHighlight);
});

test('Gap residues are colored unconserved_or_default', ({ expect }) => {
  const sequences = ['-', '-', '-'];
  const expected = [
    [{ residue: '-', position: 0, color: 'unconserved_or_default' }],
    [{ residue: '-', position: 0, color: 'unconserved_or_default' }],
    [{ residue: '-', position: 0, color: 'unconserved_or_default' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Hydrophobic (A,L,V) residues are hydrophobic if WLVIMAFCYHP > 0.6', ({ expect }) => {
  const sequences = ['A', 'L', 'V']; // All in WLVIMAFCYHP, percent = 1.0
  const expected = [
    [{ residue: 'A', position: 0, color: 'hydrophobic' }],
    [{ residue: 'L', position: 0, color: 'hydrophobic' }],
    [{ residue: 'V', position: 0, color: 'hydrophobic' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Positive charge (K,R) are positive_charge if KR > 0.6', ({ expect }) => {
  const sequences = ['K', 'R', 'K']; // All in KR, percent(KR) = 1.0
  const expected = [
    [{ residue: 'K', position: 0, color: 'positive_charge' }],
    [{ residue: 'R', position: 0, color: 'positive_charge' }],
    [{ residue: 'K', position: 0, color: 'positive_charge' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Positive charge (K) is positive_charge if K > 85%', ({ expect }) => {
  const sequences = ['K', 'K', 'K', 'K']; // percent(["K"]) = 1.0, satisfies K > 85%
  const expected = [
    [{ residue: 'K', position: 0, color: 'positive_charge' }],
    [{ residue: 'K', position: 0, color: 'positive_charge' }],
    [{ residue: 'K', position: 0, color: 'positive_charge' }],
    [{ residue: 'K', position: 0, color: 'positive_charge' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Negative charge (E) is negative_charge if QE > 0.5; Q is polar', ({ expect }) => {
  const sequences = ['E', 'Q', 'E']; // percent(QE) = 1.0
  const expected = [
    [{ residue: 'E', position: 0, color: 'negative_charge' }], // E is negative_charge
    [{ residue: 'Q', position: 0, color: 'polar' }], // Q is polar by its own rule (QE > 0.5 part)
    [{ residue: 'E', position: 0, color: 'negative_charge' }], // E is negative_charge
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Negative charge (D,E) are negative_charge if ED > 0.5', ({ expect }) => {
  const sequences = ['D', 'E', 'D']; // percent(ED) = 1.0
  const expected = [
    [{ residue: 'D', position: 0, color: 'negative_charge' }],
    [{ residue: 'E', position: 0, color: 'negative_charge' }],
    [{ residue: 'D', position: 0, color: 'negative_charge' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Polar (N) is polar if N > 50%; D is unconserved for this data', ({ expect }) => {
  // For N: percent(['N']) = 2/3 ≈ 0.66 > 0.5.
  // For D: With sequences ['N', 'N', 'D'], relevant conditions for negative_charge are not met.
  // e.g., percentForAny(['D','E','N'], 0.85) is false as percent(['D']) ≈ 0.33, percent(['N']) ≈ 0.66.
  // percent(ED) > 0.5 is also false.
  const sequences = ['N', 'N', 'D'];
  const expected = [
    [{ residue: 'N', position: 0, color: 'polar' }],
    [{ residue: 'N', position: 0, color: 'polar' }],
    [{ residue: 'D', position: 0, color: 'unconserved_or_default' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Polar (S,T) are polar if ST > 0.5', ({ expect }) => {
  const sequences = ['S', 'T', 'S']; // percent(ST) = 1.0 > 0.5
  const expected = [
    [{ residue: 'S', position: 0, color: 'polar' }],
    [{ residue: 'T', position: 0, color: 'polar' }],
    [{ residue: 'S', position: 0, color: 'polar' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Polar (S) is polar if percent(["S"]) > 0.85', ({ expect }) => {
  const sequences = ['S', 'S', 'S', 'S']; // percent(["S"]) = 1.0 > 0.85
  const expected = [
    [{ residue: 'S', position: 0, color: 'polar' }],
    [{ residue: 'S', position: 0, color: 'polar' }],
    [{ residue: 'S', position: 0, color: 'polar' }],
    [{ residue: 'S', position: 0, color: 'polar' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Glycine (G) is glycine', ({ expect }) => {
  const sequences = ['G', 'A', 'T'];
  const expected = [
    [{ residue: 'G', position: 0, color: 'glycine' }],
    [{ residue: 'A', position: 0, color: 'unconserved_or_default' }], // A is unconserved_or_default here
    [{ residue: 'T', position: 0, color: 'unconserved_or_default' }], // T is unconserved_or_default here
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Proline (P) is proline', ({ expect }) => {
  const sequences = ['P', 'A', 'T'];
  const expected = [
    [{ residue: 'P', position: 0, color: 'proline' }],
    [{ residue: 'A', position: 0, color: 'hydrophobic' }],
    [{ residue: 'T', position: 0, color: 'polar' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Aromatic (H,Y) are aromatic if WLVIMAFCYHP > 0.6; A is hydrophobic', ({ expect }) => {
  const sequences = ['H', 'Y', 'A']; // All in WLVIMAFCYHP, percent = 1.0
  const expected = [
    [{ residue: 'H', position: 0, color: 'aromatic' }],
    [{ residue: 'Y', position: 0, color: 'aromatic' }],
    [{ residue: 'A', position: 0, color: 'hydrophobic' }], // A becomes hydrophobic by its own rule
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

test('Uncommon residues (X,Z,B) are unconserved_or_default by default', ({ expect }) => {
  const sequences = ['X', 'Z', 'B'];
  const expected = [
    [{ residue: 'X', position: 0, color: 'unconserved_or_default' }],
    [{ residue: 'Z', position: 0, color: 'unconserved_or_default' }],
    [{ residue: 'B', position: 0, color: 'unconserved_or_default' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});

// Test case demonstrating the Cysteine (C) Pink/Blue interaction
// With current code order, C becomes hydrophobic if WLVIMAFCYHP > 0.6,
// even if percent(['C']) > 0.85. Pink rule for C is shadowed.
test('Cysteine (C) becomes hydrophobic if WLVIMAFCYHP > 0.6 (shadowing cysteine_specific rule)', ({ expect }) => {
  const sequences = ['C', 'C', 'C', 'C']; // percent(['C']) = 1.0, percent(WLVIMAFCYHP) = 1.0
  const expected = [
    [{ residue: 'C', position: 0, color: 'hydrophobic' }],
    [{ residue: 'C', position: 0, color: 'hydrophobic' }],
    [{ residue: 'C', position: 0, color: 'hydrophobic' }],
    [{ residue: 'C', position: 0, color: 'hydrophobic' }],
  ];
  expect(highlightAlignment(sequences)).toEqual(expected);
});
