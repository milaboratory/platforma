---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@platforma-sdk/model": minor
"@platforma-sdk/ui-vue": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-mcp-server": minor
---

Args validation: a block says why its args are not ready instead of throwing from `.args()`.
`.argsValidation(({ args, data }) => ArgsIssue[])`, set after `.args()`, lists issues of the args derived from the current data; `ArgsIssue` is `{ severity: "error" | "warning"; message }`. An `error` keeps the block from running, as a throw from `.args()` does; a `warning` leaves it runnable and is only reported. A throw from `.args()` or from the validation counts as one error with the thrown message. A severity other than `"warning"` counts as an error.
`.prerunArgsValidation(({ prerunArgs, data }) => ArgsIssue[])`, set after `.prerunArgs()`, does the same for the prerun: an error skips the prerun. `.prerunArgs()` is generic over the prerun args type, which types the `prerunArgs` the validation receives. A block without `.prerunArgs()` runs its prerun on `.args()` only while `argsValidation` finds no errors, and reports its issues once, through the args. `done()` throws when `.prerunArgsValidation()` is set without `.prerunArgs()`, and each validation throws when called before the function it validates; setting `.args()` or `.prerunArgs()` again drops the validation set for the previous function.
In Vue, `app.argsIssues` and `app.prerunArgsIssues` hold the issues computed from the data being edited; empty for a block built with an SDK that cannot report them, and `app.prerunArgsIssues` is empty for a block without `.prerunArgs()`.
The block overview carries `argsIssues` per block.
The `__pl_args_derive` and `__pl_prerunArgs_derive` results carry `type` — `ready`, `notReady` or `blocked` — with `issues`, and for blocked args the `draft`, beside `error` / `value`, which keep their meaning for runtimes that read only those.
`mergeColumnReferences(...lists)` merges column reference lists: columns in the order first met, picked values joined, `null` only when no list picked any. `parseArgsIssues` reads issues from a value of unknown origin, and `hasArgsErrors` says whether any of them is an error.
The `blockDependencies` plugin reads the references of a block's args and of its prerun args: of each, the current ones, else the ones validation found errors in; only when neither has either, those of the last run and of the last prerun. References only the prerun args hold follow those of the args. `argsSource` is `current` when either is derived from the current data. On a runtime that keeps no invalid or prerun args, it reads current args, else the last run's, as before.
The middle layer keeps, per block, the args and the prerun args validation found errors in (`currentDraftArgs`, `currentDraftPrerunArgs`), the issues of each (`currentArgsIssues`, `currentPrerunArgsIssues`, with fingerprints of the storage and of the block model code they were found for; issues of other storage or of another model are ignored, and so is a draft next to them), and the prerun args the current staging was rendered with (`stagingArgs`). A prerun with errors leaves the previous staging in place. The overview's `argsIssues` holds the args issues for the current storage and model, warnings included while the block is runnable; a block on an older SDK that throws from `.args()` reports the thrown message as one error. The output dependency index reads the same two chains as the `blockDependencies` plugin and merges them. Fields an older middle layer left behind for a deleted block no longer make a project fail to open and are not read on load; they are removed with the next saved change and not copied when the project is duplicated.
`JsRenderInternal.ArgsFieldNames` lists the names `argsField` accepts.
MCP: `get_project_overview` and `await_block_done` report `argsIssues` per block.
