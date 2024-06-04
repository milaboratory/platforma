"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const sdk_block_config_1 = require("@milaboratory/sdk-block-config");
exports.config = sdk_block_config_1.BlockConfigBuilder.create()
    .output('dependsOnBlocks', (0, sdk_block_config_1.getResourceValueAsJson)()((0, sdk_block_config_1.getResourceField)(sdk_block_config_1.StagingOutputs, 'dependsOnBlocks')))
    .output('opts', (0, sdk_block_config_1.mapArrayValues)((0, sdk_block_config_1.getResourceValueAsJson)()((0, sdk_block_config_1.getResourceField)(sdk_block_config_1.StagingOutputs, 'opts')), (0, sdk_block_config_1.fromPlOption)(sdk_block_config_1.It))).output('sum', (0, sdk_block_config_1.getResourceValueAsJson)()((0, sdk_block_config_1.getResourceField)(sdk_block_config_1.MainOutputs, 'sum')))
    .canRun((0, sdk_block_config_1.not)((0, sdk_block_config_1.isEmpty)((0, sdk_block_config_1.getJsonField)(sdk_block_config_1.Inputs, 'sources'))))
    .sections((0, sdk_block_config_1.getImmediate)([
    { id: 'main', title: 'Main' }
]))
    .build();
//# sourceMappingURL=index.js.map