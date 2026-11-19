---
"@platforma-sdk/workflow-tengo": minor
---

`pt.workflow().memSlope()` and the `memSlope` option of `xsv.importFile` accept a fractional slope, e.g. `0.03` GiB of RAM per GiB of input. Before, the slope had to be an integer, so a step that needs far less than 1 GiB per GiB of input could only take slope 0, which stops the request from growing with input, or slope 1, which over-requests on large inputs. A fraction keeps three decimals and is rounded up, and the request is rounded up to the byte. An integer slope gives the same formula as before, so existing requests and template hashes do not change.
