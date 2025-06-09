import type { PlClient, PlTransaction, ResourceId } from '@milaboratories/pl-client';
import { projectFieldName, SchemaVersionCurrent, SchemaVersionKey } from '../model/project_model';
import { parseBlockFrontendStateKeyV1, SchemaVersionV1 } from '../model/project_model_v1';
import { field } from '@milaboratories/pl-client';
import { cachedDeserialize } from '@milaboratories/ts-helpers';

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
  const allKV = await tx.listKeyValues(rid);
  for (const kv of allKV) {
    const blockId = parseBlockFrontendStateKeyV1(kv.key);
    if (blockId === undefined) continue;
    const valueJson = cachedDeserialize(kv.value);
    const uiStateR = tx.createJsonGzValue(valueJson);
    const uiStateF = field(rid, projectFieldName(blockId, 'uiState'));
    tx.createField(uiStateF, 'Dynamic', uiStateR);
    tx.deleteKValue(rid, kv.key);
  }
}
