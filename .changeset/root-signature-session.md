---
"@milaboratories/pl-client": patch
---

Open the signed transaction on the session that minted the root signature. The two active
timeout tests sent a signature from one session on a client of another, which the backend
rejects with "signature authentication failed: session ID mismatch".
