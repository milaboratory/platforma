import type { PlClient, PlTransaction, ResourceId } from "@milaboratories/pl-client";
import type { ProjectField, ProjectStructure } from "../model/project_model";
import {
  projectFieldName,
  ProjectStructureKey,
  SchemaVersionCurrent,
  SchemaVersionKey,
  SchemaVersionV2,
} from "../model/project_model";
import { BlockFrontendStateKeyPrefixV1, SchemaVersionV1 } from "../model/project_model_v1";
import { field, isNullResourceId } from "@milaboratories/pl-client";
import { cachedDeserialize } from "@milaboratories/ts-helpers";
import { allBlocks } from "../model/project_model_util";

/**
 * Migrates the project to the latest schema version.
 *
 * @param pl - The client to use.
 * @param rid - The resource id of the project.
 */
export async function applyProjectMigrations(pl: PlClient, rid: ResourceId) {
  await pl.withWriteTx("ProjectMigration", async (tx) => {
    let schemaVersion = await tx.getKValueJson<string>(rid, SchemaVersionKey);
    if (schemaVersion === SchemaVersionCurrent) return;

    // Apply migrations in sequence
    if (schemaVersion === SchemaVersionV1) {
      await migrateV1ToV2(tx, rid);
      schemaVersion = SchemaVersionV2;
    }

    if (schemaVersion === SchemaVersionV2) {
      await migrateV2ToV3(tx, rid);
    } else if (schemaVersion !== SchemaVersionV1) {
      // If we got here and it's not v1 (which was handled above), it's unknown
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
    const uiStateF = field(rid, projectFieldName(block.id, "blockStorage"));
    tx.createField(uiStateF, "Dynamic", uiStateR);
    tx.deleteKValue(rid, kvKey);
  }
}

/**
 * Migrates the project from schema version 2 to 3.
 *
 * Summary of changes:
 * - Introduces unified 'blockStorage' field containing { args, uiState }
 * - Adds 'currentPrerunArgs' field for staging/prerun rendering
 * - For each block:
 *   1. Read existing 'blockStorage' field (contains uiState in v2)
 *   2. Read existing 'currentArgs' field (contains args)
 *   3. Create unified state = { args: currentArgs, uiState: oldState }
 *   4. Write to new {blockId}-blockStorage field (overwrites)
 *   5. Initialize {blockId}-currentPrerunArgs (same as prodArgs for v1/v2 blocks)
 * - Note: currentArgs and prodArgs fields remain for compatibility layer
 *
 * @param tx - The transaction to use.
 * @param rid - The resource id of the project.
 */
async function migrateV2ToV3(tx: PlTransaction, rid: ResourceId) {
  const [structure, fullResourceState] = await Promise.all([
    tx.getKValueJson<ProjectStructure>(rid, ProjectStructureKey),
    tx.getResourceData(rid, true),
  ]);

  // Build a map of field name -> resource id for quick lookup
  const fieldMap = new Map<string, ResourceId>();
  for (const f of fullResourceState.fields) {
    if (!isNullResourceId(f.value)) {
      fieldMap.set(f.name, f.value);
    }
  }

  for (const block of allBlocks(structure)) {
    // Read existing field values
    const uiStateFieldName = projectFieldName(block.id, "uiState" as ProjectField["fieldName"]);
    const currentArgsFieldName = projectFieldName(block.id, "currentArgs");

    const uiStateRid = fieldMap.get(uiStateFieldName);
    const currentArgsRid = fieldMap.get(currentArgsFieldName);

    // Read field data in parallel where available
    const [uiStateData, currentArgsData] = await Promise.all([
      uiStateRid ? tx.getResourceData(uiStateRid, false) : Promise.resolve(undefined),
      currentArgsRid ? tx.getResourceData(currentArgsRid, false) : Promise.resolve(undefined),
    ]);

    // Extract values - in v2, 'blockStorage' contains raw uiState, not wrapped
    const uiState = uiStateData?.data ? cachedDeserialize(uiStateData.data) : {};
    const args = currentArgsData?.data ? cachedDeserialize(currentArgsData.data) : {};

    // Create unified state: { args, uiState }
    const unifiedState = {
      args,
      uiState,
    };

    const blockStorageFieldName = projectFieldName(block.id, "blockStorage");

    // Write new unified blockStorage field (overwrite existing)
    const stateR = tx.createJsonGzValue(unifiedState);
    const stateF = field(rid, blockStorageFieldName);
    tx.createField(stateF, "Dynamic", stateR);

    // Initialize currentPrerunArgs from currentArgs (for legacy blocks, prerunArgs = args)
    if (currentArgsRid) {
      const prerunArgsR = tx.createJsonGzValue(args);
      const prerunArgsF = field(rid, projectFieldName(block.id, "currentPrerunArgs"));
      tx.createField(prerunArgsF, "Dynamic", prerunArgsR);
    }
  }
}
