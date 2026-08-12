---
'@milaboratories/pl-model-backend': major
'@platforma-sdk/tengo-builder': major
'@platforma-sdk/workflow-tengo': major
'@milaboratories/pl-middle-layer': major
'@platforma-sdk/block-tools': major
---

Template pack format v4: store the template graph as a flat node map, and
compress packs with zstd.

`CompiledTemplateV3.template` nests each sub-template inline, so a template
shared by N parents is serialised once per path that reaches it. Sharing is
common and the graph is deep, so the expansion is multiplicative. The
published `sequence-embeddings` block held 39 distinct templates expanded
into 11,672 nodes; 87 % of its pack was the same `libs` metadata records
repeated at every node.

`pl.tengo-template.v4` adds `hashToTemplate`, keyed by a node's content hash,
and `templates` now holds hash references. This is the same trick
`hashToSource` already used for source text, applied to the nodes.

Packs are also now zstd (level 19) instead of gzip, and are named
`main.plj.zst`. The extension is the codec: readers pick gzip or zstd from
the file name, so packs published as `.plj.gz` stay readable indefinitely.

Measured on `@platforma-open/milaboratories.sequence-embeddings@1.4.1`:

| | v3 + gzip | v4 + zstd |
|---|---|---|
| on disk | 802 KiB | 128 KiB |
| decompressed | 29.10 MiB | 1.01 MiB |
| load (decompress + parse) | 93.3 ms | 2.7 ms |
| retained heap | 93.1 MiB | 3.1 MiB |

The layout carries the load and memory win; zstd carries most of the
remaining size win. zstd alone on a v3 pack reaches 134 KiB but improves
load by only 1.1x and heap not at all, because the cost is `JSON.parse` of
29 MiB.

Across `@platforma-sdk/workflow-tengo`'s own 45 packs, decompressed size
drops from 41.65 MiB to 12.55 MiB.

Rendering a v4 pack is also cheaper. A v3 cache key had to walk the expanded
subtree on every lookup, including cache hits; a v4 child's hash already
covers its subtree, so the walk is gone. For the same block that was 35,920
node visits and 2.8M hash updates to produce 39 resources.

Readers reject `templates` reference cycles instead of recursing into them.
v3 could not express a cycle — it nested children inline, so one would have
been an infinite document. v4's hash references make it representable in a
corrupt pack.

Breaking:

- `tengo-builder` now emits v4. A pack built with this version cannot be read
  by a middle layer older than this release, which parses `main.plj.gz`
  itself. The backend is unaffected — it only ever sees the unpacked resource
  tree.
- `parseTemplate` can now return `CompiledTemplateV4`; use the exported
  `AnyCompiledTemplate` union. Exhaustive switches over the result need a v4
  arm.
- `parseTemplate`, `decompressTemplate` and `deriveRequiredCapabilities` take
  the codec as a required argument, and `ExplicitTemplate` carries a required
  `codec` field. Compressed bytes are never inspected to guess how they were
  written — the caller read them from a path or URL and passes what that name
  says. `templateCodecForPath` derives it.
- Building a block emits `main.plj.zst`, and the generated
  `components.workflow` path in a block's `package.json` changes with it.
- `@platforma-sdk/tengo-builder` now needs Node >= 22.15 for `node:zlib` zstd.
- `TemplateDataV3` is unchanged and still parsed. `pl-middle-layer` and
  `block-tools` read v2, v3 and v4, so already-published blocks keep working
  and keep their `requiredCapabilities` install gate.
