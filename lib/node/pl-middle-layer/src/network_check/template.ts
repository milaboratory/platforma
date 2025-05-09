import type { FieldId, FieldRef, PlClient, ResourceData } from '@milaboratories/pl-client';
import { type PlTransaction, ContinuePolling, field, isNotNullResourceId, isNullResourceId, Pl, poll, toGlobalFieldId } from '@milaboratories/pl-client';
import { createRenderTemplate } from '../mutator/template/render_template';
import { Templates as SdkTemplates } from '@platforma-sdk/workflow-tengo';
import type { TemplateSpecAny } from '../model/template_spec';
import { loadTemplate, prepareTemplateSpec } from '../mutator/template/template_loading';
import type { ClientDownload, LsDriver } from '@milaboratories/pl-drivers';
import { ImportFileHandleUploadData, isSignMatch, isUpload, uploadBlob, type ClientUpload, type LsEntryWithAdditionalInfo } from '@milaboratories/pl-drivers';
import type { Signer } from '@milaboratories/ts-helpers';
import { notEmpty, type MiLogger } from '@milaboratories/ts-helpers';
import type { ResourceInfo } from '@milaboratories/pl-tree';
import { text } from 'node:stream/consumers';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import type { StorageEntry } from '@milaboratories/pl-model-common';

export interface TemplateReport {
  status: 'ok' | 'warn' | 'failed';
  message: string;
}

/** Uploads `hello-world` template and checks the output is correct. */
export async function uploadTemplate(logger: MiLogger, pl: PlClient, name: string): Promise<TemplateReport> {
  try {
    const gotGreeting = await runUploadTemplate(logger, pl, name);
    if (gotGreeting !== `Hello, ${name}`) {
      return { status: 'failed', message: `Template uploading failed: expected: ${name}, got: ${gotGreeting}` };
    }

    return { status: 'ok', message: `Template uploading succeeded: ${gotGreeting}` };
  } catch (e: unknown) {
    return { status: 'failed', message: `Template uploading failed: error occurred: ${e}` };
  }
}

export async function runUploadTemplate(
  logger: MiLogger,
  pl: PlClient,
  name: string,
): Promise<string> {
  const outputs = await runTemplate(
    pl,
    SdkTemplates['check_network.upload_template'],
    true,
    (tx) => ({
      name: tx.createValue(Pl.JsonObject, JSON.stringify(name)),
    }),
    ['greeting'],
  );

  try {
    return JSON.parse(notEmpty((await getFieldValue(pl, outputs.greeting)).data?.toString()));
  } finally {
    if (outputs != undefined) {
      await deleteFields(pl, Object.values(outputs));
    }
  }
}

/** Uploads a file to the backend and checks the output is a Blob resource. */
export async function uploadFile(
  logger: MiLogger,
  signer: Signer,
  lsDriver: LsDriver,
  uploadClient: ClientUpload,
  pl: PlClient,
  filePath: string,
): Promise<TemplateReport> {
  try {
    const gotBlob = await runUploadFile(logger, signer, lsDriver, uploadClient, pl, filePath);

    if (gotBlob.type.name !== 'Blob') {
      return { status: 'failed', message: `File uploading failed: ${gotBlob.type.name}` };
    }

    return { status: 'ok', message: `File uploading succeeded: ${gotBlob.type.name}` };
  } catch (e: unknown) {
    return { status: 'failed', message: `File uploading failed: error occurred: ${e}` };
  }
}

export async function runUploadFile(
  logger: MiLogger,
  signer: Signer,
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

    if (isUpload(progress)) {
      const uploadData = ImportFileHandleUploadData.parse(JSON.parse(notEmpty(progress.data?.toString())));
      const isUploadSignMatch = isSignMatch(signer, uploadData.localPath, uploadData.pathSignature);

      if (isUploadSignMatch) {
        await uploadBlob(
          logger,
          uploadClient,
          progress,
          uploadData,
          () => false,
          {
            nPartsWithThisUploadSpeed: 10,
            nPartsToIncreaseUpload: 10,
            currentSpeed: 10,
            maxSpeed: 10,
          },
        );
      }
    }

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
      return { status: 'failed', message: `File downloading failed: expected: ${fileContent}, got: ${gotFileContent}` };
    }
    return { status: 'ok', message: `File downloading succeeded: ${gotFileContent}` };
  } catch (e: unknown) {
    return { status: 'failed', message: `File downloading failed: error occurred: ${e}` };
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
      return { status: 'failed', message: `Software check failed: got: ${gotGreeting}` };
    }
    return { status: 'ok', message: `Software check succeeded: ${gotGreeting}` };
  } catch (e: unknown) {
    return { status: 'failed', message: `Software check failed: error occurred: ${e}` };
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
      return { status: 'failed', message: `Python software check failed: got: ${gotGreeting}` };
    }
    return { status: 'ok', message: `Python software check succeeded: ${gotGreeting}` };
  } catch (e: unknown) {
    return { status: 'failed', message: `Python software check failed: error occurred: ${e}` };
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

/** Tries to download a file from every storage. */
export async function downloadFromEveryStorage(
  logger: MiLogger,
  pl: PlClient,
  lsDriver: LsDriver,
  ops: {
    minLsRequests: number;
    bytesLimit: number;
    minFileSize: number;
    maxFileSize: number;
    nFilesToCheck: number;
  },
): Promise<Record<string, TemplateReport>> {
  try {
    const storages = await lsDriver.getStorageList();
    const results: Record<string, TemplateReport> = {};

    for (const storage of storages) {
      const result = await chooseFile(lsDriver, storage, ops.nFilesToCheck, ops.minFileSize, ops.maxFileSize, ops.minLsRequests);
      if (result.file === undefined) {
        results[storage.name] = {
          status: 'warn',
          message: `No file between ${ops.minFileSize} and ${ops.maxFileSize} bytes `
            + `found in storage ${storage.name}, checked ${result.nCheckedFiles} files, `
            + `did ${result.nLsRequests} ls requests`,
        };
        continue;
      }

      logger.info(`Downloading file ${JSON.stringify(result)} from storage ${storage.name}`);
      const outputs = await runTemplate(
        pl,
        SdkTemplates['check_network.create_workdir_from_storage'],
        true,
        (tx) => ({ file: tx.createValue(Pl.JsonObject, JSON.stringify((result.file as { handle: string }).handle)) }),
        ['workdir'],
      );

      try {
        const workdir = await getFieldValue(pl, outputs.workdir);

        if (workdir.type.name.startsWith('WorkingDirectory')) {
          results[storage.name] = {
            status: 'ok',
            message: `Workdir creation succeeded, size of file: ${result.file?.size}, `
              + `checked ${result.nCheckedFiles} files, did ${result.nLsRequests} ls requests`,
          };
        } else {
          results[storage.name] = {
            status: 'failed',
            message: `Workdir creation failed: ${workdir.type.name}, size of file: ${result.file?.size}, `
              + `checked ${result.nCheckedFiles} files, did ${result.nLsRequests} ls requests`,
          };
        }
      } finally {
        await deleteFields(pl, Object.values(outputs));
      }
    }

    return results;
  } catch (e: unknown) {
    return { unknown: { status: 'failed', message: `Download from every storage failed: error occurred: ${e}` } };
  }
}

/** Chooses a random file from the storage in a size range.
 * If we couldn't find a normal-sized file, we'll return a small file to check at least something.
 */
export async function chooseFile(
  lsDriver: LsDriver,
  storage: StorageEntry,
  limit: number,
  minSize: number,
  maxSize: number,
  minLsRequests: number,
): Promise<{
    file: LsEntryWithAdditionalInfo | undefined;
    nLsRequests: number;
    nCheckedFiles: number;
  }> {
  const files = listFilesSequence(lsDriver, storage, '', 0);

  // return small file in case we don't have many normal-sized files.
  // While we'll download only a small range of bytes from the file,
  // we don't want to return a big file in case the underlying S3 doesn't support range requests.
  let smallFile: LsEntryWithAdditionalInfo | undefined;
  let nCheckedFiles = 0;
  let maxNLsRequests = 0;

  for await (const { file, nLsRequests } of files) {
    maxNLsRequests = Math.max(maxNLsRequests, nLsRequests);

    if (nCheckedFiles >= limit && maxNLsRequests > minLsRequests) {
      // we reached a limit on both the number of files and the number of ls requests.
      return { file: smallFile, nLsRequests: maxNLsRequests, nCheckedFiles };
    }
    nCheckedFiles++;
    if (minSize <= file.size && file.size <= maxSize) {
      return { file, nLsRequests: maxNLsRequests, nCheckedFiles };
    } else if (file.size < minSize) {
      smallFile = file;
    }
  }

  return { file: smallFile, nLsRequests: maxNLsRequests, nCheckedFiles };
}

/** Deep-first search for files in the storage. */
export async function* listFilesSequence(
  lsDriver: LsDriver,
  storage: StorageEntry,
  parent: string,
  nLsRequests: number,
): AsyncGenerator<{ file: LsEntryWithAdditionalInfo; nLsRequests: number }, void, unknown> {
  nLsRequests++;
  const files = await lsDriver.listRemoteFilesWithAdditionalInfo(storage.handle, parent);

  for (const file of files.entries) {
    if (file.type === 'file' && file.fullPath.startsWith(parent)) {
      yield {
        file,
        nLsRequests,
      };
    } else if (file.type === 'dir') {
      for await (const nestedFile of listFilesSequence(lsDriver, storage, file.fullPath, nLsRequests)) {
        nLsRequests = Math.max(nestedFile.nLsRequests, nLsRequests);
        yield nestedFile;
      }
    }
  }
}

/** Creates a big temporary file with random content. */
export async function createBigTempFile(): Promise<{ filePath: string }> {
  const filePath = path.join(os.tmpdir(), `check-network-big-temp-${Date.now()}.bin`);
  const fileSize = 20 * 1024 * 1024; // 20 MiB

  const fileContent = randomBytes(fileSize);

  await fs.appendFile(filePath, fileContent);

  return { filePath };
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
