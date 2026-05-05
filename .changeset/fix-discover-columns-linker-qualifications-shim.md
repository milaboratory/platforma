---
"@milaboratories/pf-spec-driver": patch
---

Re-emit empty `qualifications: []` on linker steps in `discoverColumns` responses. pframes-rs >= 1.1.31 dropped the field from the wire shape, breaking older block bundles (e.g. clonotype-browser v1.1.11) that read `step.qualifications.length` without guarding. The shim restores compatibility until all blocks rebuild against an SDK that tolerates the absent field.
