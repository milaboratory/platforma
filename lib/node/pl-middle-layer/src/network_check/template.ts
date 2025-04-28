import type { FieldId, FieldRef, PlClient, ResourceData } from '@milaboratories/pl-client';
import { type PlTransaction, ContinuePolling, field, isNotNullResourceId, isNullResourceId, Pl, poll, toGlobalFieldId } from '@milaboratories/pl-client';
import { createRenderTemplate } from '../mutator/template/render_template';
import { Templates as SdkTemplates } from '@platforma-sdk/workflow-tengo';
import type { TemplateSpecAny } from '../model/template_spec';
import { loadTemplate, prepareTemplateSpec } from '../mutator/template/template_loading';
import type { ClientDownload, LsDriver } from '@milaboratories/pl-drivers';
import { ImportFileHandleUploadData, uploadBlob, type ClientUpload } from '@milaboratories/pl-drivers';
import { notEmpty, type MiLogger } from '@milaboratories/ts-helpers';
import type { ResourceInfo } from '@milaboratories/pl-tree';
import { text } from 'node:stream/consumers';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

export interface TemplateReport {
  ok: boolean;
  message: string;
}

/** Uploads `hello-world` template and checks the output is correct. */
export async function uploadTemplate(logger: MiLogger, pl: PlClient, name: string): Promise<TemplateReport> {
  try {
    const gotGreeting = await runUploadTemplate(logger, pl, name);
    if (gotGreeting !== `Hello, ${name}`) {
      return { ok: false, message: `Template uploading failed: expected: ${name}, got: ${gotGreeting}` };
    }

    return { ok: true, message: `Template uploading succeeded: ${gotGreeting}` };
  } catch (e: unknown) {
    return { ok: false, message: `Template uploading failed: error occurred: ${e}` };
  }
}

export async function runUploadTemplate(
  logger: MiLogger,
  pl: PlClient,
  name: string,
): Promise<string> {
  const greeting = await runTemplate(
    pl,
    SdkTemplates['check_network.upload_template'],
    true,
    (tx) => ({
      name: tx.createValue(Pl.JsonObject, JSON.stringify(name)),
    }),
    ['greeting'],
  );

  try {
    return JSON.parse(notEmpty((await getFieldValue(pl, greeting.greeting)).data?.toString()));
  } finally {
    await deleteFields(pl, Object.values(greeting));
  }
}

/** Uploads a file to the backend and checks the output is a Blob resource. */
export async function uploadFile(
  logger: MiLogger,
  lsDriver: LsDriver,
  uploadClient: ClientUpload,
  pl: PlClient,
  filePath: string,
): Promise<TemplateReport> {
  try {
    const gotBlob = await runUploadFile(logger, lsDriver, uploadClient, pl, filePath);

    if (gotBlob.type.name !== 'Blob') {
      return { ok: false, message: `File uploading failed: ${gotBlob.type.name}` };
    }

    return { ok: true, message: `File uploading succeeded: ${gotBlob.type.name}` };
  } catch (e: unknown) {
    return { ok: false, message: `File uploading failed: error occurred: ${e}` };
  }
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

  try {
    const progress = await getFieldValue(pl, result.progress);

    await uploadBlob(
      logger,
      uploadClient,
      progress,
      ImportFileHandleUploadData.parse(JSON.parse(notEmpty(progress.data?.toString()))),
      () => false,
      {
        nPartsWithThisUploadSpeed: 1,
        nPartsToIncreaseUpload: 1,
        currentSpeed: 1,
        maxSpeed: 1,
      },
    );

    return await getFieldValue(pl, result.file);
  } finally {
    await deleteFields(pl, Object.values(result));
  }
}

/** Uploads a file to the backend and then tries to download it back. */
export async function downloadFile(
  logger: MiLogger,
  pl: PlClient,
  lsDriver: LsDriver,
  uploadClient: ClientUpload,
  downloadClient: ClientDownload,
  filePath: string,
  fileContent: string,
): Promise<TemplateReport> {
  try {
    const gotFileContent = await runDownloadFile(logger, pl, lsDriver, uploadClient, downloadClient, filePath);

    if (gotFileContent !== fileContent) {
      return { ok: false, message: `File downloading failed: expected: ${fileContent}, got: ${gotFileContent}` };
    }
    return { ok: true, message: `File downloading succeeded: ${gotFileContent}` };
  } catch (e: unknown) {
    return { ok: false, message: `File downloading failed: error occurred: ${e}` };
  }
}

export async function runDownloadFile(
  logger: MiLogger,
  pl: PlClient,
  lsDriver: LsDriver,
  uploadClient: ClientUpload,
  downloadClient: ClientDownload,
  filePath: string,
) {
  const handle = await lsDriver.getLocalFileHandle(filePath);

  const outputs = await runTemplate(
    pl,
    SdkTemplates['check_network.download_blob'],
    true,
    (tx) => ({ file: tx.createValue(Pl.JsonObject, JSON.stringify(handle)) }),
    ['progress', 'file'],
  );

  try {
    const progress = await getFieldValue(pl, outputs.progress);

    await uploadBlob(
      logger,
      uploadClient,
      progress,
      ImportFileHandleUploadData.parse(JSON.parse(notEmpty(progress.data?.toString()))),
      () => false,
      {
        nPartsWithThisUploadSpeed: 1,
        nPartsToIncreaseUpload: 1,
        currentSpeed: 1,
        maxSpeed: 1,
      },
    );

    const fileInfo = await getFieldValue(pl, outputs.file);
    const { content } = await downloadClient.downloadBlob(fileInfo);

    return await text(content);
  } finally {
    await deleteFields(pl, Object.values(outputs));
  }
}

/** Runs Go's hello-world binary. */
export async function softwareCheck(pl: PlClient): Promise<TemplateReport> {
  try {
    const gotGreeting = await runSoftware(pl);

    if (gotGreeting !== 'Hello from go binary\n') {
      return { ok: false, message: `Software check failed: got: ${gotGreeting}` };
    }
    return { ok: true, message: `Software check succeeded: ${gotGreeting}` };
  } catch (e: unknown) {
    return { ok: false, message: `Software check failed: error occurred: ${e}` };
  }
}

export async function runSoftware(pl: PlClient): Promise<string> {
  const result = await runTemplate(
    pl,
    SdkTemplates['check_network.run_hello_world'],
    true,
    (_: PlTransaction) => ({}),
    ['greeting'],
  );

  try {
    return notEmpty((await getFieldValue(pl, result.greeting)).data?.toString());
  } finally {
    await deleteFields(pl, Object.values(result));
  }
}

/** Runs Python hello-world. */
export async function pythonSoftware(pl: PlClient, name: string): Promise<TemplateReport> {
  try {
    const gotGreeting = await runPythonSoftware(pl, name);

    if (gotGreeting !== `Hello, ${name}!\n`) {
      return { ok: false, message: `Python software check failed: got: ${gotGreeting}` };
    }
    return { ok: true, message: `Python software check succeeded: ${gotGreeting}` };
  } catch (e: unknown) {
    return { ok: false, message: `Python software check failed: error occurred: ${e}` };
  }
}

export async function runPythonSoftware(pl: PlClient, name: string): Promise<string> {
  const result = await runTemplate(
    pl,
    SdkTemplates['check_network.run_hello_world_py'],
    true,
    (tx) => ({ name: tx.createValue(Pl.JsonObject, JSON.stringify(name)) }),
    ['greeting'],
  );

  try {
    return notEmpty((await getFieldValue(pl, result.greeting)).data?.toString());
  } finally {
    await deleteFields(pl, Object.values(result));
  }
}

/** Creates a temporarly file we could use for uploading and downloading. */
export async function createTempFile(): Promise<{ filePath: string; fileContent: string }> {
  const filePath = path.join(os.tmpdir(), `check-network-temp-${Date.now()}.txt`);

  const fileContent = 'Hello, world! ' + new Date().toISOString();
  await fs.writeFile(filePath, fileContent);

  return { filePath, fileContent };
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
): Promise<ResourceData> {
  // We could also do polling with pl-tree, but it seemed like an overkill,
  // that's why we have a simple polling here.

  return await poll(client, async (tx) => {
    const field = await tx.tx.getField(fieldId);
    if (isNotNullResourceId(field.error)) {
      const err = await tx.tx.getResourceData(field.error, true);
      throw new Error(`getFieldValue of "${fieldId.fieldName}" field failed: ${err.data}`);
    }

    if (isNullResourceId(field.value)) {
      throw new ContinuePolling();
    }

    return await tx.tx.getResourceData(field.value, true);
  });
}

async function deleteFields(client: PlClient, fieldIds: FieldId[]) {
  await client.withWriteTx('DeleteFields', async (tx) => {
    for (const fieldId of fieldIds) {
      tx.resetField(fieldId);
    }
    await tx.commit();
  });
}
