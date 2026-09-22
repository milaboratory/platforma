---
"@milaboratories/pl-client": patch
---

Keep the request timeout the test address states.

`plAddressToTestConfig` overwrote `defaultRequestTimeout` with the 500ms local budget, so `?request-timeout=3000` on `PL_ADDRESS` had no effect. Against the Kubernetes deploy a call that needs more than 500ms hit the deadline and retried until the case ran out of time. The test budget now applies only to an address that states no timeout of its own.
