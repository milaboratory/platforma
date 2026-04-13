/** LRU cache depth for table state per sourceId */
export const STATE_CACHE_DEPTH = 5;

/** Debounce delay (ms) for persisting table state to v-model */
export const STATE_PERSIST_DEBOUNCE_MS = 300;

/** ag-grid server-side cache block size */
export const CACHE_BLOCK_SIZE = 1000;

/** Maximum number of blocks kept in ag-grid cache */
export const MAX_BLOCKS_IN_CACHE = 100;

/** Debounce delay (ms) for block loading in ag-grid */
export const BLOCK_LOAD_DEBOUNCE_MS = 500;

/** Row number column identifier */
export const ROW_NUMBER_COL_ID = '"##RowNumberColumnId##"';

/** Default header size (px) for row number column */
export const ROW_NUMBER_HEADER_SIZE = 45;

/** Widest digit character used for measuring row number column width */
export const WIDEST_DIGIT = "5";

/** Timeout (ms) for waiting on selection update confirmation */
export const SELECTION_UPDATE_TIMEOUT_MS = 500;
