import {
  type CanonicalizedJson,
  parseJson,
  type PlMultiSequenceAlignmentModel,
  type PTableColumnId,
} from '@platforma-sdk/model';
import { type Ref } from 'vue';

const latestVersion = 1;

export function runMigrations(model: Ref<PlMultiSequenceAlignmentModel>) {
  const currentVersion = getCurrentVersion(model.value);
  try {
    if (currentVersion < 1) {
      const oldLabelColumnIds = model.value.labelColumnIds as unknown as
        | CanonicalizedJson<PTableColumnId>[]
        | undefined;
      if (oldLabelColumnIds) {
        model.value.labelColumnIds = oldLabelColumnIds
          .map((id) => parseJson(id));
      }
    }
  } catch (error) {
    console.error(error);
    model.value = {};
  } finally {
    model.value.version = latestVersion;
  }
}

/**
 * If a model has a version, return it.
 * If it doesn't, but contains anything at all, that's version 0,
 * which is a pre-versioning version.
 * Otherwise, emtpy model is treated as the latest model.
 */
function getCurrentVersion(model: PlMultiSequenceAlignmentModel) {
  if (model.version !== undefined) return model.version;
  if (Object.keys(model).length) return 0;
  return latestVersion;
}
