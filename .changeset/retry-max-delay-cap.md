---
"@milaboratories/pl-client": patch
---

Cap a single transaction-retry backoff delay at 5s (`retryMaxDelay`, overridable via the `retry-max-delay` url param). The exponential sequence previously grew unbounded across all 21 attempts, so a conflicting transaction could sleep ~66s in one step and several minutes in total.
