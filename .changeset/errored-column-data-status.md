---
"@platforma-sdk/model": patch
---

A table built with `createPlDataTableV3` shows a column whose data failed with the `error` status, and no longer fails as a whole. The data of a column failed when its `.data` field holds an error, with or without a value. Before, a field with an error and no value made the table output throw, and a field with an error and a value was shown as ready. `DataColumn` leaves now give `undefined` data for such a column. The error is found by the read the table already makes for its visible columns, so no column is read that was not read before, and `getDataStatus()` still does not read the data. New `getColumnDataState` tells ready, pending and failed data apart; `hasColumnData` behaves as before for data that did not fail. A block picks this up when it is rebuilt with this SDK.
