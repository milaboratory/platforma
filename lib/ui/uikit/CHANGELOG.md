# @milaboratories/uikit

## 2.10.22

### Patch Changes

- Updated dependencies [a3659cd]
  - @platforma-sdk/model@1.54.9

## 2.10.21

### Patch Changes

- Updated dependencies [4f04561]
  - @platforma-sdk/model@1.54.8

## 2.10.20

### Patch Changes

- 0ae1854: createPTableV2 + Advanced filter in AgTable
- Updated dependencies [0ae1854]
  - @milaboratories/helpers@1.13.4
  - @platforma-sdk/model@1.54.7

## 2.10.19

### Patch Changes

- Updated dependencies [2dc3b33]
  - @milaboratories/helpers@1.13.3
  - @platforma-sdk/model@1.53.15

## 2.10.18

### Patch Changes

- Updated dependencies [c620234]
  - @platforma-sdk/model@1.53.15
  - @milaboratories/helpers@1.13.2

## 2.10.17

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/helpers@1.13.2
  - @platforma-sdk/model@1.53.14

## 2.10.16

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/helpers@1.13.1
  - @platforma-sdk/model@1.53.13

## 2.10.15

### Patch Changes

- Updated dependencies [209554d]
  - @platforma-sdk/model@1.53.11

## 2.10.14

### Patch Changes

- Updated dependencies [d963d19]
  - @platforma-sdk/model@1.53.10

## 2.10.13

### Patch Changes

- @platforma-sdk/model@1.53.5

## 2.10.12

### Patch Changes

- @platforma-sdk/model@1.53.4

## 2.10.11

### Patch Changes

- Updated dependencies [f459e5a]
  - @platforma-sdk/model@1.53.3

## 2.10.10

### Patch Changes

- Updated dependencies [57799dd]
  - @platforma-sdk/model@1.53.2

## 2.10.9

### Patch Changes

- Updated dependencies [a748b92]
  - @platforma-sdk/model@1.53.1

## 2.10.8

### Patch Changes

- Updated dependencies [43b4247]
  - @platforma-sdk/model@1.53.0

## 2.10.7

### Patch Changes

- Updated dependencies [48e8984]
  - @platforma-sdk/model@1.52.7

## 2.10.6

### Patch Changes

- Updated dependencies [1e4b72a]
  - @platforma-sdk/model@1.52.3

## 2.10.5

### Patch Changes

- Updated dependencies [1694d1a]
  - @platforma-sdk/model@1.52.0

## 2.10.4

### Patch Changes

- Updated dependencies [38534c5]
  - @platforma-sdk/model@1.51.9

## 2.10.3

### Patch Changes

- 601a869: PlDropdownMulti: don't show loading spinner when disabled

## 2.10.2

### Patch Changes

- Updated dependencies [b0ceca1]
  - @platforma-sdk/model@1.51.6

## 2.10.1

### Patch Changes

- Updated dependencies [dd9a004]
  - @platforma-sdk/model@1.51.5

## 2.10.0

### Minor Changes

- 0f0a802: PlBlockPage: Added editable subtitles and made title into a prop

## 2.9.1

### Patch Changes

- Updated dependencies [5dc0a70]
  - @platforma-sdk/model@1.51.2

## 2.9.0

### Minor Changes

- a12641f: Removed default text from PlPlaceholder, made a separate export for text variants.

## 2.8.9

### Patch Changes

- fc75a16: Updated `PlLogView` to work with `OutputWithStatus`
- Updated dependencies [fc75a16]
- Updated dependencies [fc75a16]
  - @platforma-sdk/model@1.50.0
  - @milaboratories/helpers@1.13.0

## 2.8.8

### Patch Changes

- Updated dependencies [88f33fa]
  - @platforma-sdk/model@1.49.0

## 2.8.7

### Patch Changes

- 35a16d0: use blob URL for paint worklet to comply with CSP

## 2.8.6

### Patch Changes

- Updated dependencies [d6856e2]
  - @platforma-sdk/model@1.48.14

## 2.8.5

### Patch Changes

- Updated dependencies [72bb768]
  - @platforma-sdk/model@1.48.13

## 2.8.4

### Patch Changes

- 8abf3c6: fix annotations problems
- Updated dependencies [8abf3c6]
  - @platforma-sdk/model@1.48.12

## 2.8.3

### Patch Changes

- Updated dependencies [f62e11c]
  - @milaboratories/helpers@1.12.1
  - @platforma-sdk/model@1.48.4

## 2.8.2

### Patch Changes

- Updated dependencies [3e168c4]
  - @platforma-sdk/model@1.48.4

## 2.8.1

### Patch Changes

- @platforma-sdk/model@1.48.2

## 2.8.0

### Minor Changes

- 8398f3a: Add PlPlaceholder and PlLoaderLogo components

## 2.7.3

### Patch Changes

- Updated dependencies [5deb79a]
  - @platforma-sdk/model@1.47.5

## 2.7.2

### Patch Changes

- 92439e1: ts-builder ignore customcudition for build/serve without flag
  - @milaboratories/helpers@1.12.0
  - @platforma-sdk/model@1.46.0

## 2.7.1

### Patch Changes

- 10aab62: Fix PlDropdown showing loading spinner when disabled

  When a PlDropdown is both disabled and has undefined options, it no longer shows a loading spinner. The disabled state now takes precedence over the loading state, preventing misleading UX where users think they need to wait when they actually need to interact with another control first.

## 2.7.0

### Minor Changes

- a81ce44: simplify pl autocomplete interface

### Patch Changes

- Updated dependencies [a81ce44]
  - @platforma-sdk/model@1.46.0

## 2.6.5

### Patch Changes

- bf6fe49: Update advanced filters and types
- Updated dependencies [bf6fe49]
  - @platforma-sdk/model@1.45.45

## 2.6.4

### Patch Changes

- Updated dependencies [2c07d5a]
  - @platforma-sdk/model@1.45.42

## 2.6.3

### Patch Changes

- 3d915f9: Fix vue warning in PlDropdown (update vue 3.5.13 -> v3.5.24)

## 2.6.2

### Patch Changes

- d088e83: add pl-advanced-filter
- Updated dependencies [d088e83]
  - @platforma-sdk/model@1.45.35

## 2.6.1

### Patch Changes

- 2893e7c: [sdk;desktop] Fix PlTextField height bug

## 2.6.0

### Minor Changes

- 1e9b8da: Implement the `usePollingQuery` composable with abort-aware polling, state tracking, and comprehensive test coverage mirroring upstream interval behaviour.

## 2.5.7

### Patch Changes

- Updated dependencies [17e5fe7]
  - @platforma-sdk/model@1.45.30

## 2.5.6

### Patch Changes

- 8996bed: Publish again, previous publish failed

## 2.5.5

### Patch Changes

- 38b2b47: update btnsplit icon usage

## 2.5.4

### Patch Changes

- 5814e48: Small changes in sdk
- Updated dependencies [55b218b]
- Updated dependencies [5814e48]
  - @platforma-sdk/model@1.45.26

## 2.5.3

### Patch Changes

- Updated dependencies [6f67293]
  - @platforma-sdk/model@1.45.23

## 2.5.2

### Patch Changes

- d1ee07b: Migration to vitest

## 2.5.1

### Patch Changes

- Updated dependencies [64cee78]
  - @platforma-sdk/model@1.45.17

## 2.5.0

### Minor Changes

- 3ef2381: Generelazation filters and annotations

### Patch Changes

- Updated dependencies [3ef2381]
  - @platforma-sdk/model@1.45.0

## 2.4.30

### Patch Changes

- 5da4817: Remove generated svg components to favor the PlSvg component
- c521792: autocomplete - avoid empty options list on every opening

## 2.4.29

### Patch Changes

- Updated dependencies [31a1ac2]
  - @platforma-sdk/model@1.44.14

## 2.4.28

### Patch Changes

- Updated dependencies [fcdb249]
  - @platforma-sdk/model@1.44.13

## 2.4.27

### Patch Changes

- @platforma-sdk/model@1.44.8

## 2.4.26

### Patch Changes

- Updated dependencies [18203d0]
  - @milaboratories/helpers@1.12.0
  - @platforma-sdk/model@1.44.5

## 2.4.25

### Patch Changes

- @platforma-sdk/model@1.44.5

## 2.4.24

### Patch Changes

- @platforma-sdk/model@1.44.4

## 2.4.23

### Patch Changes

- 900b8fa: fix dropdown list position

## 2.4.22

### Patch Changes

- Updated dependencies [ef22c49]
  - @milaboratories/helpers@1.11.0
  - @platforma-sdk/model@1.44.1

## 2.4.21

### Patch Changes

- Updated dependencies [261a742]
- Updated dependencies [a9517a8]
- Updated dependencies [d5cbbd8]
  - @milaboratories/helpers@1.10.0
  - @platforma-sdk/model@1.43.29

## 2.4.20

### Patch Changes

- @platforma-sdk/model@1.43.29

## 2.4.19

### Patch Changes

- Updated dependencies [ed7a454]
  - @platforma-sdk/model@1.43.21

## 2.4.18

### Patch Changes

- Updated dependencies [0a11758]
  - @platforma-sdk/model@1.43.18

## 2.4.17

### Patch Changes

- Updated dependencies [916de57]
  - @milaboratories/helpers@1.9.0
  - @platforma-sdk/model@1.43.14

## 2.4.16

### Patch Changes

- Updated dependencies [5cc2e06]
  - @milaboratories/helpers@1.8.1
  - @platforma-sdk/model@1.43.2

## 2.4.15

### Patch Changes

- @platforma-sdk/model@1.43.2

## 2.4.14

### Patch Changes

- Updated dependencies [d60cc17]
  - @platforma-sdk/model@1.43.0

## 2.4.13

### Patch Changes

- Updated dependencies [fc0eb68]
  - @milaboratories/helpers@1.8.0
  - @platforma-sdk/model@1.42.51

## 2.4.12

### Patch Changes

- Updated dependencies [6bc20d1]
  - @platforma-sdk/model@1.42.51

## 2.4.11

### Patch Changes

- Updated dependencies [3d9638e]
  - @platforma-sdk/model@1.42.47

## 2.4.10

### Patch Changes

- @platforma-sdk/model@1.42.46

## 2.4.9

### Patch Changes

- Updated dependencies [b2e7c82]
  - @milaboratories/helpers@1.7.0
  - @platforma-sdk/model@1.42.36

## 2.4.8

### Patch Changes

- @platforma-sdk/model@1.42.36

## 2.4.7

### Patch Changes

- Updated dependencies [27c258f]
  - @platforma-sdk/model@1.42.35

## 2.4.6

### Patch Changes

- e8f0e58: Added 2 new icons: analytics and file-logs

## 2.4.5

### Patch Changes

- b14b2fb: update dist builder
- Updated dependencies [b14b2fb]
  - @milaboratories/helpers@1.6.21
  - @platforma-sdk/model@1.42.23

## 2.4.4

### Patch Changes

- 6b9828a: Remove unused styles, fix lint warnings, update comments

## 2.4.3

### Patch Changes

- 56b404b: Add PlAutocompleteMulti component
- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/helpers@1.6.20
  - @platforma-sdk/model@1.42.20

## 2.4.2

### Patch Changes

- 604827a: [desktop] add button to save block error log to file

## 2.4.1

### Patch Changes

- Updated dependencies [b8105fb]
  - @platforma-sdk/model@1.42.15

## 2.4.0

### Minor Changes

- 5c49322: Allow any key types in PlDropdownRef

### Patch Changes

- 68776f8: Prevent Teleport-using components from triggering outside click

## 2.3.29

### Patch Changes

- @platforma-sdk/model@1.42.10

## 2.3.28

### Patch Changes

- @platforma-sdk/model@1.42.8

## 2.3.27

### Patch Changes

- Updated dependencies [636088d]
  - @platforma-sdk/model@1.42.4

## 2.3.26

### Patch Changes

- 911f928: Fix PlNumberField min/max constraint

## 2.3.25

### Patch Changes

- @platforma-sdk/model@1.42.1

## 2.3.24

### Patch Changes

- @platforma-sdk/model@1.42.0

## 2.3.23

### Patch Changes

- e2a1629: update dependencies

## 2.3.22

### Patch Changes

- 093dbda: explicit setup z-index

## 2.3.21

### Patch Changes

- c29b40f: use uniq custom condition
- Updated dependencies [c29b40f]
  - @milaboratories/helpers@1.6.19
  - @platforma-sdk/model@1.41.6

## 2.3.20

### Patch Changes

- Updated dependencies [41140f4]
  - @platforma-sdk/model@1.41.4

## 2.3.19

### Patch Changes

- Updated dependencies [d469422]
  - @platforma-sdk/model@1.41.3

## 2.3.18

### Patch Changes

- Updated dependencies [28b630f]
  - @platforma-sdk/model@1.41.2

## 2.3.17

### Patch Changes

- Updated dependencies [e48177a]
  - @platforma-sdk/model@1.41.1

## 2.3.16

### Patch Changes

- Updated dependencies [e7c0edb]
  - @platforma-sdk/model@1.41.0

## 2.3.15

### Patch Changes

- 9bb26ff: PlAgDataTableV2 - linker columns handling fix
- Updated dependencies [9bb26ff]
  - @platforma-sdk/model@1.40.6

## 2.3.14

### Patch Changes

- 5e69d64: Add annotations components and model
- Updated dependencies [5e69d64]
  - @milaboratories/helpers@1.6.18
  - @platforma-sdk/model@1.40.5

## 2.3.13

### Patch Changes

- 98eded5: Update styles

## 2.3.12

### Patch Changes

- 2273454: Dont use permament svg w/h

## 2.3.11

### Patch Changes

- Updated dependencies [890240e]
  - @platforma-sdk/model@1.40.1

## 2.3.10

### Patch Changes

- 30ce5da: Updated `PlNumberField` to handle fractional increments/decrements better
- Updated dependencies [30ce5da]
  - @platforma-sdk/model@1.40.0

## 2.3.9

### Patch Changes

- 986c20c: computedCached moved to uikit, watchCached implemented

## 2.3.8

### Patch Changes

- Updated dependencies [c12345a]
- Updated dependencies [c12345a]
  - @platforma-sdk/model@1.39.18

## 2.3.7

### Patch Changes

- bc814d2: Fix: stop click propagation from FileDialogModal

## 2.3.6

### Patch Changes

- 8aec1b5: add icons

## 2.3.5

### Patch Changes

- 66a2689: update package json deps

## 2.3.4

### Patch Changes

- @platforma-sdk/model@1.39.8

## 2.3.3

### Patch Changes

- @platforma-sdk/model@1.39.7

## 2.3.2

### Patch Changes

- Updated dependencies [d525c60]
  - @platforma-sdk/model@1.39.6

## 2.3.1

### Patch Changes

- Updated dependencies [3b46d33]
- Updated dependencies [3b46d33]
  - @platforma-sdk/model@1.39.0

## 2.3.0

### Minor Changes

- bd788f9: PlAgDataTable V1 removed, V2 significantly changed

### Patch Changes

- Updated dependencies [bd788f9]
  - @platforma-sdk/model@1.38.0

## 2.2.98

### Patch Changes

- d60b0fe: Chore: fix linter errors
- Updated dependencies [d60b0fe]
  - @platforma-sdk/model@1.37.18

## 2.2.97

### Patch Changes

- e210414: Reimplement interface for PlElementList
- Updated dependencies [e210414]
  - @milaboratories/helpers@1.6.17

## 2.2.96

### Patch Changes

- 8236387: Grouping in PlDropdown
- Updated dependencies [8236387]
  - @milaboratories/helpers@1.6.16
  - @platforma-sdk/model@1.37.14

## 2.2.95

### Patch Changes

- 70eff11: update plelementlist interface

## 2.2.94

### Patch Changes

- Updated dependencies [10e5841]
  - @platforma-sdk/model@1.37.11

## 2.2.93

### Patch Changes

- c6b4dd2: Extend interface for PlElementList

## 2.2.92

### Patch Changes

- 37800c5: Public tools packages

## 2.2.91

### Patch Changes

- 2c3bb60: Developer build ui-examples don't required build/watch for deps

## 2.2.90

### Patch Changes

- 6ffe944: PlAgDataTableV2 refactoring
- 6ffe944: PlAgDataTable types fixed

## 2.2.89

### Patch Changes

- 60540e8: Fix: return platforma variable declaration to global scope

## 2.2.88

### Patch Changes

- e9d02ae: Correct clear icon color

## 2.2.87

### Patch Changes

- 45badc9: PlElementList implementation

## 2.2.86

### Patch Changes

- 8248b67: Fix svg icons ids collisions

## 2.2.85

### Patch Changes

- 2299e3e: Fix loading icon in the PlMultiDropdown and multi path mask icons (clipboard and similar)

## 2.2.84

### Patch Changes

- 540e690: Unified svg icon component

## 2.2.83

### Patch Changes

- 697b8a5: Replace all aliases to relative paths

## 2.2.82

### Patch Changes

- 54ebbe9: PlAgDataTable: fix reset hidden columns state, remove scroll to top after reordering columns

## 2.2.81

### Patch Changes

- d707ab4: Unify error processing in uikit

## 2.2.80

### Patch Changes

- cd3b6d5: Bump vite version and related plugins

## 2.2.79

### Patch Changes

- 4ccd249: Implementation PlErrorBoundary over reusable PlErrorAlert + PlClibpboard

## 2.2.78

### Patch Changes

- 84656a6: Get rid of .cjs and .umd in ui packages

## 2.2.77

### Patch Changes

- a23199f: PlFileInput support custom errors

## 2.2.76

### Patch Changes

- 576a72e: Removed reactivity from extensions for IPC serialization

## 2.2.75

### Patch Changes

- 2aa0f3c: PlAgDataTable row selection improvements

## 2.2.74

### Patch Changes

- d82a569: Add `indeterminate` prop support for PlCheckbox\[Base\]

## 2.2.73

### Patch Changes

- 959fe5c: update autocomplete behavior

## 2.2.72

### Patch Changes

- c831288: PlLogView: do not scroll down in network check

## 2.2.71

### Patch Changes

- 02f781b: Add "refresh status" button to Monetization component

## 2.2.70

### Patch Changes

- 141aebc: Minor monetization sidebar appearance fixes

## 2.2.69

### Patch Changes

- e51c9bb: sdk/ui-vue: stop click propagation when clicking close button in pl-notification-alert component

## 2.2.68

### Patch Changes

- fc63533: Add PlRadio and PlRadioGroup components

## 2.2.67

### Patch Changes

- 468e3d6: add autocomplete component

## 2.2.66

### Patch Changes

- 168d2eb: Move useWatchFetch to uikit

## 2.2.65

### Patch Changes

- c021ce8: [mnz] Block Product Status Component

## 2.2.64

### Patch Changes

- edaadd1: Changed cursor to pointer for PlAccordionSection

## 2.2.63

### Patch Changes

- 0d465bf: Fixed: PlDropdownMulti does not keep selection order in ui

## 2.2.62

### Patch Changes

- 22871ac: uikit and ui-vue: get global platforma from preload via hook. Now we could defined a hook and return new platforma that overrides some behaviours. It's needed for keeping old compat

## 2.2.61

### Patch Changes

- b00fefd: PlFileDialog: handle absolute paths in breadcrumbs (we got them in ssh deployment)

## 2.2.60

### Patch Changes

- be32396: Fix vue warning, when useTemplateRef uses the same name as variable (https://github.com/vuejs/core/issues/11795)

## 2.2.59

### Patch Changes

- 13e3124: added new type for columns

## 2.2.58

### Patch Changes

- 2970f8d: [blocks] Move to standard QC components (progress & qc bars) in all upstream blocks

## 2.2.57

### Patch Changes

- 0c5753b: [sdk/ui-vue] create component plSplash for “Loading” splash screen

## 2.2.56

### Patch Changes

- 4f23447: [sdk/ui-vue] Fix PlAccordionSection "twitching"

## 2.2.55

### Patch Changes

- 852dcbf: add subset icon

## 2.2.54

### Patch Changes

- 30f0eed: update pl-number-field

## 2.2.53

### Patch Changes

- 9fc0f34: Added new component PlSplash

## 2.2.52

### Patch Changes

- 821c240: [sdk/ui-vue] PlFileDialog search doesn’t affect “select all”

## 2.2.51

### Patch Changes

- 3df530d: text wrap

## 2.2.50

### Patch Changes

- 56f7e84: Migrate from scss imports to use & forward rules

## 2.2.49

### Patch Changes

- ca66b2a: [ui-kit] Check that all standard components have tooltip slot

## 2.2.48

### Patch Changes

- 3ff9dcd: Enable nested source maps in dev sdk mode

## 2.2.47

### Patch Changes

- 93e9a66: [sdk/ui-vue] Align PlDialogModal with figma (size props, etc)

## 2.2.46

### Patch Changes

- 9b5a692: [sdk/ui-vue] Histogram

## 2.2.45

### Patch Changes

- 32966e6: [desktop] Custom design for “+ add graph“ etc. sections

## 2.2.44

### Patch Changes

- 178c642: fix PlAgChartStackedBarCell styling

## 2.2.43

### Patch Changes

- ad4719e: added dropdownmultiref and loading status

## 2.2.42

### Patch Changes

- af400eb: Fixed types

## 2.2.41

### Patch Changes

- 16c729a: [sdk/ui-vue] Proportion box with legend (cell)

## 2.2.40

### Patch Changes

- 78d049b: added PlProgressCell

## 2.2.39

### Patch Changes

- 32f7bf7: TabOption exported

## 2.2.38

### Patch Changes

- 28b2b5c: [sdk/ui-vue] Proportion box with legend (standalone)
- 0cce397: Add the first implementation of the PlChartStackedBar component

## 2.2.37

### Patch Changes

- 54cdf0f: added scroll support for sortable

## 2.2.36

### Patch Changes

- 4208dcf: added PlLoaderCircular

## 2.2.35

### Patch Changes

- 22685b6: uikit: forbid text wrapping in PlBtnGroup options

## 2.2.34

### Patch Changes

- 4360a85: fix: add PlAgCellStatusTag (need update platforma deps)

## 2.2.33

### Patch Changes

- 9799fa1: [Ui-kit] Proper Cursor Styles in Dropdown Fields

## 2.2.32

### Patch Changes

- 8cb8082: [sdk-ui/vue] Migrate icon in PlBtnGhost to 24px

## 2.2.31

### Patch Changes

- ddff372: [sdk/ui-vue] PlDropdownLine glitch

## 2.2.30

### Patch Changes

- ca01bd7: [sdk/ui-vue] PlDropdownLine changing options labels is not watched properly

## 2.2.29

### Patch Changes

- 07afde6: Fix PlBlockPage title overflow bug (set overflow ellipsis and title attribute if needed)

## 2.2.28

### Patch Changes

- ec69dca: added support PlAgTextAndButtonCell for axis and fixed styles

## 2.2.27

### Patch Changes

- ec3bffe: Create a shareable eslint config as an npm package (and use it)

## 2.2.26

### Patch Changes

- f38f686: fixed styles

## 2.2.25

### Patch Changes

- 63722de: Bug: Ctrl+Click selection does not work in Samples&Data on Windows

## 2.2.24

### Patch Changes

- 56421e3: Remove local storage from the list of remote storages
- 6dcee2e: [MILAB-682] Remove local storage from list of remote storages (small format fix)

## 2.2.23

### Patch Changes

- dec84ba: Fix PlTextField disabled state and support ctrl in the multiple file selection

## 2.2.22

### Patch Changes

- 6dfa829: uikit: Add technical DropdownOverlayComponent

## 2.2.21

### Patch Changes

- 2b98d93: Fix PlTextField inner input font

## 2.2.20

### Patch Changes

- 556765e: uikit: export PlCloseModalBtn

## 2.2.19

### Patch Changes

- 0cfb225: fixed styles

## 2.2.18

### Patch Changes

- 401f5f4: Add new component PlSearchField + some PlFileDialog css fixes
- b078d28: [sdk/ui-vue] New open file control, using native OS open dialog and clear UX for selecting local or remote file

## 2.2.17

### Patch Changes

- e3d4cd0: Added PlAgGridColumnManager component and fixed a bug in useSortable that caused the drag element to move without the handle class.

## 2.2.16

### Patch Changes

- 18841ab: File dialog: clear search string when dir changes

## 2.2.15

### Patch Changes

- d1b4cd1: css fix: add flex: 1 to the main BlockPage title slot

## 2.2.14

### Patch Changes

- 1631d74: [sdk/ui-vue] Create editable title component

## 2.2.13

### Patch Changes

- 158e990: [sdk/ui-vue] PlFileDialog: add substring filter in remote file selection dialog

## 2.2.12

### Patch Changes

- 6f56890: Never show full path in PlFileInput body, show full path in tooltip

## 2.2.11

### Patch Changes

- 9a1140c: Add no-body-gutters property to the PlBlockPage components

## 2.2.10

### Patch Changes

- ec5be92: Accordion + simple section separator

## 2.2.9

### Patch Changes

- 166c161: remove global hidden webkit-srollbar

## 2.2.8

### Patch Changes

- f120c91: added tooltip for copy button

## 2.2.7

### Patch Changes

- 40fe1d4: Used PlLogView to display errors and fixed a bug with the copy button

## 2.2.6

### Patch Changes

- a53abfe: updated icons
- f908594: Fix dropdown label

## 2.2.5

### Patch Changes

- 26a5c2e: Add 'closeOnOutsideClick' option to the PlDialogModal(s)

## 2.2.4

### Patch Changes

- 54b4409: Implemented Split Button and added borders for ag-grid-sidebar

## 2.2.3

### Patch Changes

- dfa2765: fix PlLogView dimensions

## 2.2.2

### Patch Changes

- d85c758: Implement PlTabs component

## 2.2.1

### Patch Changes

- c7f9363: file dialog hotfix

## 2.2.0

### Minor Changes

- 71f6910: Update icon set

## 2.1.3

### Patch Changes

- 948c9f3: Implement teleported options for the PlDropdownMulti
- 335c3ba: Implement pl-dropdown (v2)
- 9315283: Update PlLineDropdown (teleported options)

## 2.1.2

### Patch Changes

- 17d8609: Undefined options will trigger the display of a loading status for the component.

## 2.1.1

### Patch Changes

- f04b8da: Fixed styles

## 2.1.0

### Minor Changes

- 2d1f8a8: Create “numeric” mode in PlTextField

## 2.0.13

### Patch Changes

- 5df9d1a: fixed styles and messages by default showErrorsNotification will be true

## 2.0.12

### Patch Changes

- 09f0974: Fixed styles for PlBtnGroup

## 2.0.11

### Patch Changes

- 5fd8ff2: make ghost button width auto

## 2.0.10

### Patch Changes

- d81ec02: Bring password visibility icon to Adobe standard

## 2.0.9

### Patch Changes

- 5cdfeb3: Added label and changed background gradient for error

## 2.0.8

### Patch Changes

- 4a745bf: Added password type for PlTextField

## 2.0.7

### Patch Changes

- 969a083: [uikit] Initial scrolling / auto scrolling on the last line in PlLogView

## 2.0.6

### Patch Changes

- c16492e: Update icon-set

## 2.0.5

### Patch Changes

- 8de9a0b: Add max retries parameter to PlLogView (in case of AnyLogHandle source)

## 2.0.4

### Patch Changes

- d6909bf: Add "append" slot to PlBtnGhost button

## 2.0.3

### Patch Changes

- 50f7459: Dep upgrade, vitest in particular

## 2.0.2

### Patch Changes

- 478dc27: some fixes

## 2.0.1

### Patch Changes

- 7c9d23c: Add 24_delete-bin icon

## 2.0.0

### Major Changes

- cf824ad: fixed styles for modal window

### Patch Changes

- a0854a3: Small common ui fixes
- cdb6c31: uikit: dynamically generate icon types
- e62ed59: Added component PlFileInput for AgGrid cell

## 1.2.30

### Patch Changes

- 6737e02: [sdk/ui-vue] `PlLogView` support log handle as :value

## 1.2.29

### Patch Changes

- f4e8fa6: do not consider lastError as error state

## 1.2.28

### Patch Changes

- 0b11a0a: fix close modal btn border radius

## 1.2.27

### Patch Changes

- 7f90dda: bring the dialog modal in line with the design

## 1.2.26

### Patch Changes

- 2c914cc: add the Typography example page to the ui-examples block

## 1.2.25

### Patch Changes

- 9dae9aa: migration to new LS SDK model

## 1.2.24

### Patch Changes

- 485f533: Fix PlDialogModal styles

## 1.2.23

### Patch Changes

- 0bc5034: PlFileDialog: get a default storage by initialPathHome

## 1.2.22

### Patch Changes

- f782eea: add "label or text" options to PlBtnGroup and PlCheckboxGroup components

## 1.2.21

### Patch Changes

- 03933b1: fix tooltip z-index

## 1.2.20

### Patch Changes

- db794fa: fix padding in the base dropdown

## 1.2.19

### Patch Changes

- 60e38dc: Add PlDropdownRef component, update examples

## 1.2.18

### Patch Changes

- 4628369: fix new sass nesting rules

## 1.2.17

### Patch Changes

- f7f1691: Fix slide modal content scroll

## 1.2.16

### Patch Changes

- 7a12b39: Add useWatchFetch usable

## 1.2.15

### Patch Changes

- 9ea877e: modals modals modals

## 1.2.14

### Patch Changes

- 8db877c: Implement "output" prop for PlLogView component

## 1.2.13

### Patch Changes

- 09fa81a: Added settings-2 icon

## 1.2.12

### Patch Changes

- 95f1b0d: Make any dropdown option accept "label" or "text" fields (for backward compatibility)

## 1.2.11

### Patch Changes

- 60223f4: Update example blocks, fix h1-h6 colors in uikit

## 1.2.10

### Patch Changes

- aff132f: Create ui-examples block, add PlSlideModal example

## 1.2.9

### Patch Changes

- 156a72d: Add PlLogView component

## 1.2.8

### Patch Changes

- 4fe1674: add basic ui to test-enter-numbers block

## 1.2.7

### Patch Changes

- add109d: fix modal shadow click

## 1.2.6

### Patch Changes

- d9f5f2b: export useLabelNotch

## 1.2.5

### Patch Changes

- 5f95b40: This fixes #29

## 1.2.4

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig

## 1.2.3

### Patch Changes

- a58af16: minor fixes for ui repos build scripts
