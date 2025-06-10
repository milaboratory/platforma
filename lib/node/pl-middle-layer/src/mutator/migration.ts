import type { PlClient, PlTransaction, ResourceId } from '@milaboratories/pl-client';
import type { ProjectStructure } from '../model/project_model';
import { projectFieldName, ProjectStructureKey, SchemaVersionCurrent, SchemaVersionKey } from '../model/project_model';
import { BlockFrontendStateKeyPrefixV1, SchemaVersionV1 } from '../model/project_model_v1';
import { field } from '@milaboratories/pl-client';
import { cachedDeserialize } from '@milaboratories/ts-helpers';
import { allBlocks } from '../model/project_model_util';

/**
 * Migrates the project to the latest schema version.
 *
 * @param pl - The client to use.
 * @param rid - The resource id of the project.
 */
export async function applyProjectMigrations(pl: PlClient, rid: ResourceId) {
  await pl.withWriteTx('ProjectMigration', async (tx) => {
    const schemaVersion = await tx.getKValueJson<string>(rid, SchemaVersionKey);
    if (schemaVersion === SchemaVersionCurrent) return;
    if (schemaVersion === SchemaVersionV1) {
      await migrateV1ToV2(tx, rid);
    } else {
      throw new Error(`Unknown project schema version: ${schemaVersion}`);
    }
    tx.setKValue(rid, SchemaVersionKey, JSON.stringify(SchemaVersionCurrent));
    await tx.commit();
  });
}

/**
 * Migrates the project from schema version 1 to 2.
 *
 * Summary of changes:
 * - uiState is now stored in a field instead of a KV
 *
 * @param tx - The transaction to use.
 * @param rid - The resource id of the project.
 */
async function migrateV1ToV2(tx: PlTransaction, rid: ResourceId) {
  const [structure, allKV] = await Promise.all([
    tx.getKValueJson<ProjectStructure>(rid, ProjectStructureKey),
    tx.listKeyValues(rid),
  ]);
  const kvMap = new Map<string, Uint8Array>(allKV.map((kv) => [kv.key, kv.value]));
  for (const block of allBlocks(structure)) {
    const kvKey = BlockFrontendStateKeyPrefixV1 + block.id;
    const uiState = kvMap.get(kvKey);
    const valueJson = uiState ? cachedDeserialize(uiState) : {};
    const uiStateR = tx.createJsonGzValue(valueJson);
    const uiStateF = field(rid, projectFieldName(block.id, 'uiState'));
    tx.createField(uiStateF, 'Dynamic', uiStateR);
    tx.deleteKValue(rid, BlockFrontendStateKeyPrefixV1 + block.id);
  }
}
