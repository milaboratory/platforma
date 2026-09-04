import { expect, test } from "vitest";
import * as tp from "node:timers/promises";
import type { ResourceRef, SignedResourceId } from "@milaboratories/pl-client";
import { resourceIdToString } from "@milaboratories/pl-client";
import type {
  BlockKindSelectorReference,
  BlockPackLocationReference,
  ProjectTemplateV1,
  ProjectTemplateV1Entry,
} from "@milaboratories/pl-model-common";
import { PROJECT_TEMPLATE_SCHEMA_V1 } from "@milaboratories/pl-model-common";
import type { BlockPackSpec } from "@milaboratories/pl-model-middle-layer";
import type { BlockPackProvider } from "../model/template_resolve";
import { withMl } from "../test/with_ml";
import { createTemplate } from "../mutator/template";
import type { MiddleLayer } from "./middle_layer";
import type { StoredTemplateData, TemplateId, TemplateListEntry } from "./template_list";
import { ensureTemplateListRid } from "./template_list";

/**
 * The stored-template entity against a live backend: rename, apply, share, accept.
 *
 * Every test here stores its template directly through the mutator rather than by saving a
 * project, so the document under test is the one the test wrote — a `file:` entry, an entry
 * nothing can resolve — none of which a real project would produce. What a real project
 * produces is covered by the round trip in `drivers-ml-blocks-integration`, which has block
 * packs on disk to build one from.
 *
 * Needs a backend, like every `withMl` test in this package, and no gate: `PL_ADDRESS` is
 * either configured or the client fails to connect.
 */

const KIND = "@platforma-open/milaboratories.demo.kind@^1.0.0" as BlockKindSelectorReference;

/** A block installed from a folder on the author's own machine. */
const LOCAL_FOLDER = "file:///Users/dev/blocks/demo/block" as BlockPackLocationReference;

/** A legacy registry block, which predates kinds — so it cannot be written to a template. */
const KindlessBlock: BlockPackSpec = {
  type: "from-registry-v1",
  registryUrl: "https://block.registry.platforma.bio/releases",
  id: { organization: "milaboratory", name: "enter-numbers", version: "1.1.1" },
};

test("a rename changes the label and leaves the stored document byte-identical", async () => {
  await withMl(async (ml) => {
    const document = documentOf(entry("a"), entry("b"));
    const stored = await storeTemplate(ml, "First name", {
      schemaVersion: 1,
      document,
      sourceProjectLabel: "Source project",
    });
    const dataBefore = await rawTemplateData(ml, stored.rid);

    await ml.renameTemplate(stored.id, "Second name");

    // The label is the only mutable part: the document rides in the immutable `data` blob,
    // which has no setter — improving a template means saving a new one.
    expect(await rawTemplateData(ml, stored.rid)).toStrictEqual(dataBefore);
    expect((await ml.getTemplateData(stored.id)).document).toStrictEqual(document);

    const list = await awaitTemplateList(ml, (l) => l.some((t) => t.label === "Second name"));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: stored.id,
      label: "Second name",
      blockCount: 2,
      sourceProjectLabel: "Source project",
    });
  });
});

test("an entry nothing can resolve creates no project, and every entry is reported", async () => {
  await withMl(async (ml) => {
    const stored = await storeTemplate(ml, "Nothing implements these", {
      schemaVersion: 1,
      document: documentOf(entry("a"), entry("b")),
    });

    const outcome = await ml.createProjectFromTemplate(
      stored.id,
      "From a template",
      resolvesNothing(),
    );

    if (outcome.ok) throw new Error("a template nothing can resolve must not apply");
    // Resolution runs before the project exists, which is what makes this a statement about
    // the template rather than about a half-built project.
    expect(outcome.problems.map((p) => p.entryId)).toStrictEqual(["a", "b"]);
    expect(await ml.projectList.awaitStableValue()).toStrictEqual([]);
  });
});

test("a template holding a block from a folder on this machine is refused rather than shared", async () => {
  await withMl(async (ml) => {
    const stored = await storeTemplate(ml, "Built here", {
      schemaVersion: 1,
      document: documentOf(entry("a"), entry("b", LOCAL_FOLDER)),
    });

    // Asked of a template that is merely being displayed, so the refusal can be stated on the
    // template itself instead of only once the user has tried to send it.
    expect((await ml.checkTemplateShareable(stored.id)).map((p) => p.entryId)).toStrictEqual(["b"]);

    const outcome = await ml.shareTemplate(stored.id, {
      recipients: ["colleague"],
      title: "Built here",
    });

    if (outcome.ok) throw new Error("a template with a file: entry must not be shareable");
    expect(outcome.problems.map((p) => p.entryId)).toStrictEqual(["b"]);
    // Refused before anything was written: no envelope, so nothing to revoke.
    expect((await ml.outgoingShares.getValue()) ?? []).toStrictEqual([]);
  });
});

test("a project holding a block that cannot be written out produces no template", async () => {
  await withMl(async (ml) => {
    const projectId = await ml.createProject({ label: "Two legacy blocks" });
    await ml.openProject(projectId);
    const project = ml.getOpenedProject(projectId);

    const first = await project.addBlock("Block 1", KindlessBlock);
    const second = await project.addBlock("Block 2", KindlessBlock);

    const outcome = await ml.saveProjectAsTemplate(projectId);

    if (outcome.ok) throw new Error("a project with an unexportable block must store no template");
    // Every offending block at once, not the first one: fixing an unexportable project takes
    // one pass, not one pass per block.
    expect(outcome.problems.map((p) => p.blockId).sort()).toStrictEqual([first, second].sort());
    expect(await ml.templateList.awaitStableValue()).toStrictEqual([]);
  });
});

test("an accepted template share lands on the acceptor's shelf and builds nothing", async () => {
  await withMl(async (ml) => {
    const stored = await storeTemplate(ml, "A pipeline", {
      schemaVersion: 1,
      document: documentOf(entry("a")),
      sourceProjectLabel: "Source project",
    });

    const shared = await ml.shareTemplate(stored.id, { everyone: true, title: "A pipeline" });
    if (!shared.ok) throw new Error(`share refused: ${JSON.stringify(shared.problems)}`);

    const outcome = await ml.acceptShare([shared.shareId]);

    expect(outcome.failed).toStrictEqual([]);
    expect(outcome.acceptedTemplates).toHaveLength(1);
    // Nothing is built until the recipient applies it — which is what makes an all-or-nothing
    // apply survivable for them: there is always something left to retry from.
    expect(outcome.accepted).toStrictEqual([]);
    expect(await ml.projectList.awaitStableValue()).toStrictEqual([]);

    const list = await awaitTemplateList(ml, (l) => l.length === 2);
    const accepted = list.find((t) => t.id === outcome.acceptedTemplates[0])!;
    expect(accepted.label).toBe("A pipeline");
    // Who sent it, kept as the accepted template's provenance; the donor's own source project
    // is not part of the payload and does not travel.
    expect(accepted.sender).toBe(ml.currentUserLogin ?? "");
    expect(accepted.sourceProjectLabel).toBeUndefined();
  });
});

test("a changed template share keeps its id, and whoever already responded is not re-prompted", async () => {
  await withMl(async (ml) => {
    const first = await storeTemplate(ml, "First", {
      schemaVersion: 1,
      document: documentOf(entry("a")),
    });
    const second = await storeTemplate(ml, "Second", {
      schemaVersion: 1,
      document: documentOf(entry("a"), entry("b")),
    });

    const shared = await ml.shareTemplate(first.id, { everyone: true, title: "First" });
    if (!shared.ok) throw new Error(`share refused: ${JSON.stringify(shared.problems)}`);

    // Someone responds to the share, which is what the replace below must not undo.
    const accept = await ml.acceptShare([shared.shareId]);
    expect(accept.acceptedTemplates).toHaveLength(1);

    // A stored template never changes, so an improved one is a different template — the
    // replace names it rather than re-reading the one the share started from.
    await ml.changeShare(shared.shareId, { templateId: second.id, title: "Second" });

    const outgoing = (await ml.outgoingShares.getValue()) ?? [];
    expect(outgoing.map((s) => s.shareId)).toStrictEqual([shared.shareId]);
    expect(outgoing[0]).toMatchObject({
      payloadKind: "template",
      title: "Second",
      template: { label: "Second", blockCount: 2 },
      // A template share is granted read-only, so no recipient can ever write a reply on the
      // envelope — a view has to say that rather than render an empty list as "nobody yet".
      responsesAvailable: false,
    });
    expect(outgoing[0].projects).toStrictEqual([]);

    // The decision the accept recorded is keyed on the shareId, which the change preserved, so
    // the replaced share is not offered again. A replace that minted a new id would show up
    // here as a fresh offer.
    const pending = await settledPendingShareIds(ml);
    expect(pending).not.toContain(shared.shareId);
  });
});

//
// Internals
//

const entry = (id: string, location?: BlockPackLocationReference): ProjectTemplateV1Entry => ({
  id,
  kind: KIND,
  params: {},
  ...(location !== undefined ? { location } : {}),
});

const documentOf = (...blocks: ProjectTemplateV1Entry[]): ProjectTemplateV1 => ({
  schema: PROJECT_TEMPLATE_SCHEMA_V1,
  blocks,
});

/** A stored template, plus the resource id needed to read its raw `data` blob back. */
type StoredTemplate = { id: TemplateId; rid: SignedResourceId };

/**
 * Stores one template through the mutator, on the same templates list the middle layer reads.
 *
 * The middle layer has no way to store an arbitrary document — it only saves a project — so a
 * test that needs a specific document writes it here, exactly as `saveProjectAsTemplate` and
 * the accept path do.
 */
async function storeTemplate(
  ml: MiddleLayer,
  label: string,
  data: StoredTemplateData,
): Promise<StoredTemplate> {
  let tpl: ResourceRef;
  await ml.pl.withWriteTx("TestStoreTemplate", async (tx) => {
    const listRid = await ensureTemplateListRid(tx);
    tpl = createTemplate(tx, listRid, label, data);
    await tx.commit();
  });
  const rid = await tpl!.globalId;
  return { id: resourceIdToString(rid) as TemplateId, rid };
}

/** The template's immutable `data` blob, as bytes — the form a rename must not touch. */
async function rawTemplateData(ml: MiddleLayer, rid: SignedResourceId): Promise<Buffer> {
  return await ml.pl.withReadTx("TestReadTemplateData", async (tx) => {
    const rd = await tx.getResourceData(rid, false);
    if (rd.data === undefined) throw new Error("template carries no document");
    return Buffer.from(rd.data);
  });
}

/**
 * The template list once it satisfies `predicate`.
 *
 * A template written by the mutator lands in the list through the tree's own poll, with no
 * refresh to await, so a test that stored one waits for it rather than reading once.
 */
async function awaitTemplateList(
  ml: MiddleLayer,
  predicate: (list: TemplateListEntry[]) => boolean,
  timeoutMs = 15_000,
): Promise<TemplateListEntry[]> {
  const abortSignal = AbortSignal.timeout(timeoutMs);
  while (true) {
    const list = await ml.templateList.getValue();
    if (list !== undefined && predicate(list)) return list;
    await ml.templateList.awaitChange(abortSignal);
  }
}

/**
 * The shareIds currently offered to this user, read after discovery has had a poll to run.
 *
 * Discovery of a just-granted envelope is a poll behind, so reading the view once would say
 * "not offered" about a share that simply had not been seen yet.
 */
async function settledPendingShareIds(ml: MiddleLayer): Promise<string[]> {
  await tp.setTimeout(2_000);
  return ((await ml.pendingShares.getValue()) ?? []).map((s) => s.shareId);
}

/**
 * A provider that finds nothing, for a document whose entries resolve through their kind.
 *
 * `no-implementation` rather than a thrown error: an entry whose kind exists but which
 * nothing implements is the reachable case, and it is a problem about that entry rather
 * than a failure of the apply.
 */
function resolvesNothing(): BlockPackProvider {
  return {
    byKind: () => Promise.resolve({ ok: false, reason: "no-implementation" }),
    byExactVersion: () => Promise.resolve({ ok: false, reason: "no-such-block-version" }),
    byLocation: () => Promise.resolve({ ok: false, reason: "not-found" }),
  };
}
