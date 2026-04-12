# PlAgDataTable - User Stories

## 1. Data Display

1.1. As a user, I see tabular data with rows and columns loaded from a server-side data source.

1.2. As a user, I can scroll through large datasets with virtual scrolling (data loads on demand, page by page).

1.3. As a user, I see a row number column pinned to the left side of the table.

1.4. As a user, I see column widths automatically adjusted to fit their content.

## 2. Loading & Empty States

2.1. As a user, when data has not been computed yet, I see a "cat in bag" icon with the message "Data is not computed".

2.2. As a user, when data is loading, I see a loading placeholder (splash/skeleton animation).

2.3. As a user, when analysis is running, I see a "Running analysis..." placeholder.

2.4. As a user, when data is empty (zero rows), I see a "sad cat" icon with the message "Empty".

2.5. As a user, when data source changes, I see skeleton rows while new data is being fetched.

## 3. Column Sorting

3.1. As a user, I can click a column header to sort by that column (desc -> asc -> none cycle).

3.2. As a user, I can sort via the column header context menu (Sort Descending, Sort Ascending).

3.3. As a user, when sort changes, I see skeleton rows while data reloads with the new sort order.

## 4. Column Visibility

4.1. As a user, some columns marked as "optional" in metadata are hidden by default.

4.2. As a user, I can show/hide columns through the column management panel (if not disabled by config).

4.3. As a user, my column visibility choices are persisted and restored when I return to the same data source.

## 5. Column Ordering

5.1. As a user, I see axis columns (keys) always placed first, then data columns ordered by priority annotation.

5.2. As a user, I can drag columns to reorder them (except axis columns, which are locked in position).

5.3. As a user, my column order is persisted and restored when I return to the same data source.

## 6. Column Pinning

6.1. As a user, I can pin/unpin columns via the column header context menu (Pin Left, Pin Right, No Pin).

## 7. Column Headers

7.1. As a user, I see column names derived from metadata labels (or fallback "Unlabeled axis/column N").

7.2. As a user, I see a data type indicator in each column header (Number or Text).

7.3. As a user, I see a tooltip on column headers when a description annotation is present.

## 8. Value Formatting

8.1. As a user, I see numeric values formatted according to their d3-format annotation (if specified).

8.2. As a user, I see NA values displayed as empty cells.

8.3. As a user, I see columns with a "monospace" font-family annotation rendered in Spline Sans Mono.

8.4. As a user, I see hidden (not yet loaded) column values displayed as "loading...".

## 9. Row Selection

9.1. As a user, I can select/deselect individual rows by clicking the checkbox in the row number column.

9.2. As a user, I can select/deselect all rows by clicking the checkbox in the row number header.

9.3. As a user, when I switch to a different data source, my selection is cleared.

9.4. As a user, when axes order changes but axes set stays the same, my selection is remapped to new positions.

9.5. As a user, I can use cell range selection when row selection is not enabled.

## 10. Row Actions

10.1. As a user, I can double-click a row to trigger an action (emits the row key to the parent).

10.2. As a user, I can see an action button inside a specific axis column (if configured).

10.3. As a user, clicking the cell button either triggers the row double-click action or a separate cell-button action (depending on config).

## 11. Row Focusing (programmatic)

11.1. As a consumer of the component API, I can programmatically scroll the table to a specific row by its key and focus the first cell of that row.

11.2. As a consumer of the component API, I can programmatically update the set of selected rows.

## 12. Sheet / Partition Filtering

12.1. As a user, when data has partitioned axes, I see dropdown selectors above the table to choose which partition to display.

12.2. As a user, I see each dropdown labeled with the axis annotation label (or fallback "Unlabeled axis N").

12.3. As a user, the dropdown defaults to the previously selected value (if valid), then to the metadata default, then to the first option.

12.4. As a user, my sheet selections are persisted and restored when I return to the same data source.

## 13. Column Filters

13.1. As a user, I can open a filters panel to build advanced filter expressions on columns (if not disabled by config).

13.2. As a user, I can filter text columns by pattern matching and numeric columns by equality/range.

13.3. As a user, I can combine multiple filter conditions with AND/OR logic.

13.4. As a user, my filter configuration is persisted and restored when I return to the same data source.

## 14. Fast Search

14.1. As a user, I can type in a search box to quickly filter rows across all visible columns.

14.2. As a user, text columns are searched by pattern match and numeric columns by exact numeric match.

14.3. As a user, my search string is persisted and restored when I return to the same data source.

## 15. CSV/TSV Export

15.1. As a user, I can click an export button to download all table data as a TSV file named "table.tsv" (if export is enabled by config).

## 16. Status Bar

16.1. As a user, I see the total row count at the bottom of the table (e.g. "1 row", "42 rows").

16.2. As a user, when I have selected rows, I see the selection count appended (e.g. "42 rows (3 selected)").

## 17. State Persistence

17.1. As a user, my table state (grid state, sheet selection, filters, search string) is cached per data source (up to 5 most recent sources, LRU).

17.2. As a user, when I return to a previously viewed data source, all my UI state is restored.

17.3. As a user, state changes are debounced (300ms) before being persisted.

## 18. Slots / Layout Extension

18.1. As a consumer of the component, I can inject custom content before and after the sheets dropdown row via named slots ("before-sheets", "after-sheets").
