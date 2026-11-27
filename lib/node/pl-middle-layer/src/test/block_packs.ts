import { BlockPackPreparer } from "../mutator/block-pack/block_pack";
import { HmacSha256Signer } from "@milaboratories/ts-helpers";
import type { BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import { V2RegistryProvider } from "../block_registry/registry-v2-provider";
import { defaultHttpDispatcher } from "@milaboratories/pl-http";
import type { PlClient } from "@milaboratories/pl-client";
import type { BlockPackSpecPrepared } from "../model";
import { cacheBlockPackTemplate } from "../mutator/template/template_cache";

export const TestBPPreparer = new BlockPackPreparer(
  new V2RegistryProvider(defaultHttpDispatcher()),
  new HmacSha256Signer(HmacSha256Signer.generateSecret()),
);

/** Prepares a block pack and installs its template, as `Project.addBlock` does. */
export async function prepareInstalled(
  pl: PlClient,
  spec: BlockPackSpec,
): Promise<BlockPackSpecPrepared> {
  const prepared = await TestBPPreparer.prepare(spec);
  return await cacheBlockPackTemplate(pl, prepared, { preparer: TestBPPreparer });
}

export const BPSpecEnterV041NotPrepared: BlockPackSpec = {
  type: "from-registry-v1",
  registryUrl: "https://block.registry.platforma.bio/releases",
  id: {
    organization: "milaboratory",
    name: "enter-numbers",
    version: "0.5.0",
  },
};

export const BPSpecSumV042NotPrepared: BlockPackSpec = {
  type: "from-registry-v1",
  registryUrl: "https://block.registry.platforma.bio/releases",
  id: {
    organization: "milaboratory",
    name: "sum-numbers",
    version: "0.5.0",
  },
};
