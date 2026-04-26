---
"@platforma-sdk/ui-vue": patch
---

Add native CSV/TSV export path in PlAgCsvExporter that delegates to downloadPTableCsv when available in desktop runtime, with automatic fallback to browser-based export
