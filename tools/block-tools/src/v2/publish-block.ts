import type { BlockPackManifest } from "@milaboratories/pl-model-middle-layer";
import type { BlockRegistryV2 } from "./registry/registry";
import type { RelativeContentReader } from "./model";
import {
  readModelCompiledKindRef,
  readFacadeKindDependency,
  resolveFacadeKind,
} from "./kind/resolve-refs";
import { checkKindVersionMatch } from "./kind/version-match";

/**
 * Publish a block package, kind-first.
 *
 * This is the single forward-compat seam the deferred kind/template phases
 * extend. It sequences exactly three steps around the existing facade publish:
 *
 *   1. resolve both kind refs (Q-0004 quarantined inside `resolve-refs`),
 *   2. run the pure version-match gate — hard-fails before ANY S3 write,
 *   3. `publishKind` (kind content → `kinds/` tree, idempotent, source-hash
 *      guarded), then
 *   4. `publishPackage` — the facade block, byte-for-byte unchanged.
 *
 * A block that declares no kind (`description.kind` absent) publishes exactly as
 * before: the gate and `publishKind` are skipped entirely.
 *
 * The channel marker / coords write / refresh tail stays in the publish command
 * and runs only after this resolves.
 */
export async function publishBlock(
  registry: BlockRegistryV2,
  manifest: BlockPackManifest,
  facadeDir: string,
  fileReader: RelativeContentReader,
): Promise<void> {
  const modelKindRef = readModelCompiledKindRef(manifest);

  if (modelKindRef !== undefined) {
    // 1. resolve the facade-declared kind dependency (Q-0004 quarantine)
    const facadeDep = readFacadeKindDependency(facadeDir);
    if (facadeDep === undefined) {
      throw new Error(
        `Model was compiled against kind ${modelKindRef}, but the facade declares ` +
          `no kind dependency in its package.json.`,
      );
    }

    // Resolve to concrete artifacts (concrete version + kind content + reader).
    const resolvedKind = await resolveFacadeKind(facadeDir, facadeDep.npmName);

    // 2. pure gate — throws KindVersionMismatchError before any S3 write
    checkKindVersionMatch(modelKindRef, resolvedKind.ref);

    // 3. kind FIRST — idempotent, source-hash-guarded write to the kinds/ tree
    await registry.publishKind(resolvedKind.manifest, resolvedKind.fileReader);
  }

  // 4. facade — unchanged behavior
  await registry.publishPackage(manifest, fileReader);
}
