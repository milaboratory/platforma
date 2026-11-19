import type { PlClient, ResourceType, SignedResourceId } from "@milaboratories/pl-client";
import {
  ensureSignedResourceIdNotNull,
  field,
  isNotNullSignedResourceId,
} from "@milaboratories/pl-client";
import { setTimeout } from "node:timers/promises";
import type { BlockPackSpecPrepared } from "../../model";
import type { BlockPackPreparer } from "../block-pack/block_pack";
import { throwIfMissingServerCapabilities } from "../block-pack/required_capabilities";
import { getDebugFlags } from "../../debug";
import { ACCESS_KEY_PREFIX, getOrCreateTemplateCache, loadTemplateCached } from "./template_cache";

export const TengoTemplateInstall: ResourceType = { name: "TengoTemplateInstall", version: "1" };
export const TengoTemplateURLSource: ResourceType = {
  name: "TengoTemplateURLSource",
  version: "1",
};

const INSTALL_KEY_PREFIX = "install_";
const INSTALL_TIMEOUT_MS = 60_000;
const INSTALL_POLL_MS = 200;

/**
 * Pre-materialize a block pack's template, in separate transactions, and return a copy of the
 * spec with the template replaced by a cached reference. A registry pack is installed by the
 * backend when it advertises `templateInstall:v1`; anything else, and any failed backend install,
 * is materialized by the client through the template cache.
 */
export async function cacheBlockPackTemplate(
  pl: PlClient,
  spec: BlockPackSpecPrepared,
  options?: {
    cacheResourceId?: SignedResourceId;
    preparer?: Pick<BlockPackPreparer, "downloadRegistryPack">;
  },
): Promise<BlockPackSpecPrepared> {
  const template = spec.template;
  if (template.type === "cached") return spec;

  if (template.type !== "registry-pack") {
    const resourceId = await loadTemplateCached(pl, template, options);
    return { ...spec, template: { type: "cached", resourceId } };
  }

  if (pl.hasCapability("templateInstall:v1") && !getDebugFlags().disableTemplateInstall) {
    const cacheRid = options?.cacheResourceId ?? (await getOrCreateTemplateCache(pl));
    const resourceId = await installTemplateOnBackend(pl, cacheRid, template);
    if (resourceId !== undefined) return { ...spec, template: { type: "cached", resourceId } };
  }

  if (options?.preparer === undefined)
    throw new Error("BUG: a registry pack needs a preparer to fall back to the client");
  const downloaded = await options.preparer.downloadRegistryPack(template);
  // The manifest may predate the requiredCapabilities field: check what the pack declares.
  throwIfMissingServerCapabilities(pl, downloaded.requiredCapabilities);
  const resourceId = await loadTemplateCached(pl, downloaded.template, options);
  return { ...spec, template: { type: "cached", resourceId } };
}

/**
 * Asks the backend to download and install the pack, keeping the request in the template cache
 * so it outlives this call. Returns undefined when the install fails or times out; the failed
 * request is dropped from the cache so the next attempt asks again.
 * @internal exported for testing
 */
export async function installTemplateOnBackend(
  pl: PlClient,
  cacheRid: SignedResourceId,
  source: { url: string; sha256: string },
): Promise<SignedResourceId | undefined> {
  const key = INSTALL_KEY_PREFIX + source.sha256;

  const installId = await pl.withWriteTx("templateInstall:request", async (tx) => {
    const cacheField = field(cacheRid, key);
    tx.setKValue(cacheRid, ACCESS_KEY_PREFIX + key, Date.now().toString());

    if (await tx.fieldExists(cacheField)) {
      const fd = await tx.getField(cacheField);
      await tx.commit();
      return ensureSignedResourceIdNotNull(fd.value);
    }

    const install = tx.createStruct(TengoTemplateInstall);
    tx.setField(
      field(install, "source"),
      tx.createValue(
        TengoTemplateURLSource,
        JSON.stringify({ url: source.url, sha256: source.sha256 }),
      ),
    );
    tx.lockInputs(install);
    tx.createField(cacheField, "Dynamic", install);
    await tx.commit();
    return await install.globalId;
  });

  const deadline = Date.now() + INSTALL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const fd = await pl.withReadTx("templateInstall:poll", (tx) =>
      tx.getField(field(installId, "template")),
    );
    if (isNotNullSignedResourceId(fd.value)) return fd.value;
    if (isNotNullSignedResourceId(fd.error)) break;
    await setTimeout(INSTALL_POLL_MS);
  }

  try {
    await pl.withWriteTx("templateInstall:drop", async (tx) => {
      tx.removeField(field(cacheRid, key));
      tx.deleteKValue(cacheRid, ACCESS_KEY_PREFIX + key);
      await tx.commit();
    });
  } catch {
    // Another client or the cache GC already dropped it.
  }
  return undefined;
}
