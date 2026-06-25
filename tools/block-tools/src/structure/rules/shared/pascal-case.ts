// `pascalCase(shortName)` → the block-named alias prefix the facade entry
// template emits (`<PascalName>BlockContract`, …). Splits on any run of
// non-alphanumeric characters and capitalises each segment's first char:
//   test-sum-numbers-v3  → TestSumNumbersV3
//   mixcr-clonotyping-2  → MixcrClonotyping2
//   samples-and-data     → SamplesAndData
export function pascalCase(s: string): string {
  const joined = s
    .split(/[^A-Za-z0-9]+/)
    .filter((seg) => seg.length > 0)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join("");
  // A leading digit (e.g. `3d-viewer` → `3dViewer`) is not a valid identifier
  // start — the prefix becomes `const 3dViewerBlockPointer = …`. Prepend `_`.
  return /^[0-9]/.test(joined) ? `_${joined}` : joined;
}
