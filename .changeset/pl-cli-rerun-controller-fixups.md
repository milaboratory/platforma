---
"@milaboratories/pl-client": minor
"@platforma-sdk/pl-cli": minor
---

Add the `pl-cli maintenance controller` command group. `list` prints the registered controllers with their IDs and resources fixup levels. `rerun-fixups --controller-name <type> | --controller-id <id>` sets the resources fixup level of the selected controllers to 0, so each of them applies its one-time resources fixups again on the next backend start. Use it after a rollback to a backend version without resources fixups. `pl-client` gets `listRegisteredControllers`, and `PlTransaction` gets `setControllerKValue` and `getControllerKValueIfExists` for the controller key-value store (controller or admin credentials).
