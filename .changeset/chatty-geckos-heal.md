---
'@platforma-sdk/workflow-tengo': minor
---

Additional string manipulation functions for pt library:

- `strContains(pattern, options)` - Check if string contains a pattern (regex or literal mode with strict validation)
- `strContainsAny(patterns, options)` - Check if string contains any of multiple literal patterns using Aho-Corasick algorithm with optional case-insensitive matching
- `strCountMatches(pattern, options)` - Count occurrences of a pattern in string (regex or literal mode)
- `strExtract(pattern, options)` - Extract parts of string using regex patterns with capture group support
- `strStartsWith(prefix)` - Check if string starts with a literal prefix
- `strEndsWith(suffix)` - Check if string ends with a literal suffix

All functions accept both string literals and expression objects as parameters and provide comprehensive options for different matching modes.
