---
"@milaboratories/pl-client": minor
---

Add `LicensePayload` type and `decodeLicenseToken` helper, describing the decoded body of a Platforma license token next to the Maintenance API `license()` call that returns it. Includes a test that fetches the license from a live backend and asserts the required payload fields are always present.
