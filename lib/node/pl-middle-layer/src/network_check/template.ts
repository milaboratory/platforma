import type { FieldId, FieldRef, PlClient, ResourceId } from '@milaboratories/pl-client';
import { type PlTransaction, ContinuePolling, field, isNotNullResourceId, isNullResourceId, Pl, poll, resDataToJson, toGlobalFieldId } from '@milaboratories/pl-client';
import { createRenderTemplate } from '../mutator/template/render_template';
import { Templates as SdkTemplates } from '@platforma-sdk/workflow-tengo';
import type { TemplateSpecAny } from '../model/template_spec';
import { loadTemplate, prepareTemplateSpec } from '../mutator/template/template_loading';
import type { ClientDownload, LsDriver } from '@milaboratories/pl-drivers';
import { ImportFileHandleUploadData, uploadBlob, type ClientUpload } from '@milaboratories/pl-drivers';
import type { MiddleLayer } from '../middle_layer';
import type { MiLogger } from '@milaboratories/ts-helpers';
import type { ResourceInfo } from '@milaboratories/pl-tree';
import { text } from 'node:stream/consumers';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

export interface TemplateReport {
  ok: boolean;
  message: string;
}

export async function createTempFile(): Promise<{ filePath: string; fileContent: string }> {
  const filePath = path.join(os.tmpdir(), `check-network-temp-${Date.now()}.txt`);

  const fileContent = 'Hello, world! ' + new Date().toISOString();
  await fs.writeFile(filePath, fileContent);

  return { filePath, fileContent };
}

export async function uploadTemplate(pl: PlClient, name: string): Promise<TemplateReport> {
  const outputs = await runUploadTemplate(pl, name);
  return checkUploadTemplate(pl, outputs, name);
}

export async function runUploadTemplate(pl: PlClient, name: string): Promise<string> {
  const greeting = await runTemplate(
    pl,
    SdkTemplates['check_network.upload_template'],
    true,
    (tx) => ({
      name: tx.createValue(Pl.JsonObject, JSON.stringify(name)),
    }),
    ['greeting'],
  );

  const result = (await getFieldValue(pl, greeting.greeting)).data;

  await deleteFields(pl, Object.values(greeting));

  return result;
}

export function checkUploadTemplate(pl: PlClient, gotName: string, expectedName: string): TemplateReport {
  if (gotName !== expectedName) {
    return {
      ok: false,
      message: `Template uploading failed: expected: ${expectedName}, got: ${gotName}`,
    };
  }
  return {
    ok: true,
    message: `Template uploading succeeded: ${gotName}`,
  };
}

export async function uploadFile(
  logger: MiLogger,
  lsDriver: LsDriver,
  uploadClient: ClientUpload,
  pl: PlClient,
  filePath: string,
): Promise<{ report: TemplateReport; blobId: ResourceId }> {
  const result = await runUploadFile(logger, lsDriver, uploadClient, pl, filePath);
  return {
    report: checkUploadFile(pl, result),
    blobId: result.id,
  };
}

export async function runUploadFile(
  logger: MiLogger,
  lsDriver: LsDriver,
  uploadClient: ClientUpload,
  pl: PlClient,
  filePath: string,
): Promise<ResourceInfo> {
  const handle = await lsDriver.getLocalFileHandle(filePath);
  const result = await runTemplate(
    pl,
    SdkTemplates['check_network.upload_blob'],
    true,
    (tx) => ({
      file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)),
    }),
    ['progress', 'file'],
  );

  const progress = await getFieldValue(pl, result.progress);

  await uploadBlob(
    logger,
    uploadClient,
    progress,
    ImportFileHandleUploadData.parse(progress.data),
    () => false,
    {
      nPartsWithThisUploadSpeed: 1,
      nPartsToIncreaseUpload: 1,
      currentSpeed: 1,
      maxSpeed: 1,
    },
  );

  return await getFieldValue(pl, result.file);
}

export function checkUploadFile(pl: PlClient, gotBlob: ResourceInfo): TemplateReport {
  if (gotBlob.type.name !== 'Blob') {
    return {
      ok: false,
      message: `File uploading failed: ${gotBlob.type.name}`,
    };
  }
  return {
    ok: true,
    message: `File uploading succeeded: ${gotBlob.type.name}`,
  };
}

export async function downloadFile(
  pl: PlClient,
  downloadClient: ClientDownload,
  fileId: ResourceId,
  fileContent: string,
): Promise<TemplateReport> {
  const result = await runDownloadFile(pl, downloadClient, fileId);
  return checkDownloadFile(pl, result, fileContent);
}

export async function runDownloadFile(
  pl: PlClient,
  downloadClient: ClientDownload,
  file: ResourceId,
) {
  const outputs = await runTemplate(
    pl,
    SdkTemplates['check_network.download_blob'],
    true,
    (_: PlTransaction) => ({ file }),
    ['file'],
  );

  const fileInfo = await getFieldValue(pl, outputs.file);
  const { content } = await downloadClient.downloadBlob(fileInfo);

  return await text(content);
}

export function checkDownloadFile(pl: PlClient, gotFile: string, expectedFile: string): TemplateReport {
  if (gotFile !== expectedFile) {
    return {
      ok: false,
      message: `File downloading failed: expected: ${expectedFile}, got: ${gotFile}`,
    };
  }
  return {
    ok: true,
    message: `File downloading succeeded: ${gotFile}`,
  };
}

/** Creates a template and RenderTemplate resources, gets all resources from outputs.
 * Throws a error if any of the outputs failed.
 */
async function runTemplate(
  client: PlClient,
  tpl: TemplateSpecAny,
  ephemeral: boolean,
  inputs: (tx: PlTransaction) => Pl.PlRecord,
  outputs: string[],
): Promise<Record<string, FieldId>> {
  return await client.withWriteTx('TemplateRender', async (tx) => {
    const preparedTemplate = await prepareTemplateSpec(tpl);
    const tplResource = loadTemplate(tx, preparedTemplate);

    const outputFields: Record<string, FieldRef> = createRenderTemplate(
      tx, tplResource, ephemeral, inputs(tx), outputs,
    );

    const outputsIds: Record<string, FieldId> = {};

    for (const output of outputs) {
      const fieldRef = field(client.clientRoot, output);
      tx.createField(fieldRef, 'Dynamic', outputFields[output]);
      outputsIds[output] = await toGlobalFieldId(fieldRef);
    }

    await tx.commit();

    return outputsIds;
  });
}

/** Gets a resource from field's value or throws a error. */
async function getFieldValue(
  client: PlClient,
  fieldId: FieldId,
) {
  // We could also do polling with pl-tree, but it seemed like an overkill,
  // that's why we have a simple polling here.

  return await poll(client, async (tx) => {
    const field = await tx.tx.getField(fieldId);
    if (isNotNullResourceId(field.error)) {
      const err = await tx.tx.getResourceData(field.error, true);
      throw new Error(`${fieldId.fieldName} failed: ${err.data}`);
    }

    if (isNullResourceId(field.value)) {
      throw new ContinuePolling();
    }

    const res = await tx.tx.getResourceData(field.value, true);

    return {
      id: res.id,
      type: res.type,
      data: resDataToJson(res),
    };
  });
}

async function deleteFields(client: PlClient, fieldIds: FieldId[]) {
  await client.withWriteTx('DeleteFields', async (tx) => {
    for (const fieldId of fieldIds) {
      tx.resetField(fieldId);
    }
    return Promise.resolve(true);
  });
}
