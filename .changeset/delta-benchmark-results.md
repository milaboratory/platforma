---
"@milaboratories/pl-tree": minor
---

Fix the benchmark's tree construction and correctness guard, and record the measured result:
delta transfers ~3.9x less than backend streaming with zero wasted re-fetches, and
finalisation must stay on because root-only seeding loses every quiet-parent change.
