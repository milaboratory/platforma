import { BlockPointer as downloadBlobURLSpec } from "@milaboratories/milaboratories.test-blob-url-custom-protocol";
import type { platforma as downloadBlobURLModel } from "@milaboratories/milaboratories.test-blob-url-custom-protocol.model";
import { BlockPointer as downloadFileSpec } from "@milaboratories/milaboratories.test-download-file";
import type { platforma as downloadFileModel } from "@milaboratories/milaboratories.test-download-file.model";
import { BlockPointer as readLogsSpec } from "@milaboratories/milaboratories.test-read-logs";
import type { platforma as readLogsModel } from "@milaboratories/milaboratories.test-read-logs.model";
import { BlockPointer as uploadFileSpec } from "@milaboratories/milaboratories.test-upload-file";
import type { platforma as uploadFileModel } from "@milaboratories/milaboratories.test-upload-file.model";
import { BlockPointer as transferFilesSpec } from "@milaboratories/milaboratories.transfer-files";
import type { platforma as transferFilesModel } from "@milaboratories/milaboratories.transfer-files.model";
import type {
  FolderURL,
  ImportFileHandle,
  InferBlockState,
  LocalBlobHandleAndSize,
  MiddleLayer,
  RangeBytes,
  RemoteBlobHandleAndSize,
} from "@milaboratories/pl-middle-layer";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { createHash } from "node:crypto";
import * as fsp from "node:fs/promises";
import path from "node:path";
import { compareBuffersInChunks, computeHashIncremental, shuffleInPlace } from "./imports";

blockTest(
  "v3: should create download-file block, render it and gets outputs from its config",
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock("DownloadFile", downloadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      "answer_to_the_ultimate_question.txt",
    );

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { inputHandle },
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof downloadFileModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      if (outputs.contentAsString.ok) {
        expect(outputs.contentAsString.value).toStrictEqual("42\n");
        expect((outputs.contentAsString1 as any).value).toStrictEqual("42\n42\n");
        expect((outputs.contentAsStringRange as any).value).toStrictEqual("2");
        expect((outputs.contentAsStringRange1 as any).value).toStrictEqual("22");

        expect((outputs.contentAsJson as any).value).toStrictEqual(42);
        const localBlob = (outputs.downloadedBlobContent as any).value as LocalBlobHandleAndSize;
        const remoteBlob = (outputs.onDemandBlobContent as any).value as RemoteBlobHandleAndSize;
        const quickJsRemoteBlob = (outputs.onDemandBlobContent1 as any)
          .value as RemoteBlobHandleAndSize;

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(localBlob.handle)).toString("utf-8"),
        ).toEqual("42\n");

        expect(
          Buffer.from(await ml.driverKit.blobDriver.getContent(remoteBlob.handle)).toString(
            "utf-8",
          ),
        ).toEqual("42\n");

        expect(
          Buffer.from(
            await ml.driverKit.blobDriver.getContent(remoteBlob.handle, { from: 1, to: 2 }),
          ).toString("utf-8"),
        ).toEqual("2");

        expect(
          Buffer.from(
            await ml.driverKit.blobDriver.getContent(quickJsRemoteBlob.handle, { from: 1, to: 2 }),
          ).toString("utf-8"),
        ).toEqual("2");

        return;
      }
    }
  },
);

blockTest(
  "v3: transfer-files concurrent downloads",
  { timeout: 600000 },
  async ({ rawPrj: project, ml, tmpFolder, expect }) => {
    const blockId = await project.addBlock("TransferFiles", transferFilesSpec);

    // Create test files with known content (text and binary)
    const testFiles: Array<{ name: string; buffer: Buffer }> = [
      {
        name: "test_small_text.txt",
        buffer: Buffer.from(
          "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
        ),
      },
      {
        name: "test_medium_text.txt",
        buffer: Buffer.from(
          "Lazy dog jumps over the lazy fox. And the quick brown fox jumps over the lazy dog.",
        ),
      },
      {
        name: "test_json.json",
        buffer: Buffer.from(JSON.stringify({ message: "Hello from JSON", value: 42 })),
      },
    ];

    const inputHandles: ImportFileHandle[] = [];
    const originalBuffers: Buffer[] = [];

    // Create temporary files and get their handles
    const storages = await ml.driverKit.lsDriver.getStorageList();
    const local = storages.find((s) => s.name == "local");
    expect(local).not.toBeUndefined();

    const testDir = path.join(tmpFolder, "test-files");
    await fsp.mkdir(testDir, { recursive: true });
    console.log("Created test directory:", testDir);

    for (const testFile of testFiles) {
      const filePath = path.join(testDir, testFile.name);
      await fsp.writeFile(filePath, testFile.buffer);
      console.log(`Created test file: ${testFile.name} (${testFile.buffer.length} bytes)`);
      originalBuffers.push(testFile.buffer);

      const files = await ml.driverKit.lsDriver.listFiles(local!.handle, testDir);
      const ourFile = files.entries.find((f) => f.name == testFile.name);
      expect(ourFile).not.toBeUndefined();
      expect(ourFile?.type).toBe("file");

      inputHandles.push((ourFile as any).handle);
    }

    // transfer-files is a V3 block (modelAPIVersion 2); the deprecated
    // setBlockArgs hardcodes modelAPIVersion 1 and would mismatch.
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { inputHandles },
    });
    await project.runBlock(blockId);

    async function testChunkedDownload(
      originalBuffer: Buffer,
      exportedBlob: RemoteBlobHandleAndSize,
      chunkSize: number,
    ) {
      console.log("  Test: Chunked download with hash verification, chunkSize", chunkSize);

      const totalChunks = Math.ceil(originalBuffer.length / chunkSize);

      console.log(
        `    - Downloading ${originalBuffer.length} bytes in ${totalChunks} chunks of ${chunkSize} bytes`,
      );

      const downloadedChunks: Buffer[] = [];
      let downloadedBytes = 0;

      const startTime = Date.now();

      const tasks = [] as { chunkIndex: number; range: RangeBytes }[];

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const from = chunkIndex * chunkSize;
        const to = Math.min(from + chunkSize, exportedBlob.size);
        tasks.push({
          chunkIndex,
          range: { from, to },
        });
      }

      shuffleInPlace(tasks);

      const results = await Promise.all(
        tasks.map(async ({ chunkIndex }) => {
          const from = chunkIndex * chunkSize;
          const to = Math.min(from + chunkSize, exportedBlob.size);
          const expectedChunkSize = to - from;

          const chunk = await ml.driverKit.blobDriver.getContent(exportedBlob.handle, { from, to });
          const chunkBuffer = Buffer.from(chunk);

          // Verify chunk size
          if (chunkBuffer.length !== expectedChunkSize) {
            console.error(
              `    ❌ Chunk ${chunkIndex}: size mismatch! Expected ${expectedChunkSize}, got ${chunkBuffer.length}`,
            );
            console.error(`       Range: from=${from}, to=${to}`);
          }

          // Verify chunk content against original
          const originalChunk = originalBuffer.subarray(from, to);
          if (!chunkBuffer.equals(originalChunk)) {
            console.error(`    ❌ Chunk ${chunkIndex}: content mismatch!`);
            console.error(`       Range: from=${from}, to=${to}`);
            console.error(
              `       First 20 bytes of original:   ${originalChunk.subarray(0, 20).toString("hex")}`,
            );
            console.error(
              `       First 20 bytes of downloaded: ${chunkBuffer.subarray(0, 20).toString("hex")}`,
            );

            // Find first differing byte
            for (let i = 0; i < Math.min(originalChunk.length, chunkBuffer.length); i++) {
              if (originalChunk[i] !== chunkBuffer[i]) {
                console.error(
                  `       First difference at byte ${i}: original=0x${originalChunk[i].toString(16)}, downloaded=0x${chunkBuffer[i].toString(16)}`,
                );
                break;
              }
            }
          }

          // downloadedChunks.push(chunkBuffer);
          downloadedBytes += chunk.length;

          if ((chunkIndex + 1) % 10 === 0 || chunkIndex === totalChunks - 1) {
            const progress = ((downloadedBytes / originalBuffer.length) * 100).toFixed(1);
            console.log(`    - Downloaded ${chunkIndex + 1}/${totalChunks} chunks (${progress}%)`);
          }

          return {
            chunkIndex,
            chunkBuffer,
          };
        }),
      );

      const sortedResults = results.sort((a, b) => a.chunkIndex - b.chunkIndex);

      for (const result of sortedResults) {
        downloadedChunks.push(result.chunkBuffer);
      }

      const downloadTime = Date.now() - startTime;
      const downloadSpeed = (downloadedBytes / 1024 / 1024 / (downloadTime / 1000)).toFixed(2);
      console.log(`    - Download completed in ${downloadTime}ms (${downloadSpeed} MB/s)`);

      // Concatenate all chunks
      console.log("    - Concatenating chunks...");
      const downloadedBuffer = Buffer.concat(downloadedChunks);

      // Verify size
      expect(downloadedBuffer.length).toBe(originalBuffer.length);
      console.log(`    ✓ Downloaded size matches: ${downloadedBuffer.length} bytes`);

      // Compute hashes
      console.log("    - Computing hashes...");
      const originalHash = computeHashIncremental(originalBuffer);
      const downloadedHash = computeHashIncremental(downloadedBuffer);

      console.log(`    - Original hash:    ${originalHash}`);
      console.log(`    - Downloaded hash:  ${downloadedHash}`);

      // Verify hashes match
      expect(downloadedHash).toBe(originalHash);
      console.log("    ✓ Hashes match - data integrity verified!");

      // Additional verification: compare buffers in chunks
      console.log("    - Comparing buffers in chunks...");
      const buffersMatch = compareBuffersInChunks(originalBuffer, downloadedBuffer);
      expect(buffersMatch).toBe(true);
      console.log("    ✓ Chunk-by-chunk comparison passed!");

      console.log("  ✓ Chunked download test passed");
    }

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof transferFilesModel>;

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();

      const outputs = state.outputs;

      if (outputs.fileImports.ok && outputs.fileExports.ok) {
        const fileImports = outputs.fileImports.value;
        const fileExports = outputs.fileExports.value as Record<
          ImportFileHandle,
          RemoteBlobHandleAndSize
        >;

        console.log("\n=== File Transfer Results ===");
        console.log(`Files imported: ${Object.keys(fileImports).length}`);
        console.log(`Files exported: ${Object.keys(fileExports).length}`);

        // Verify all files were imported
        expect(Object.keys(fileImports).length).toBe(testFiles.length);
        expect(Object.keys(fileExports).length).toBe(testFiles.length);

        // Test each file with comprehensive range testing
        await Promise.all(
          testFiles.map(async (testFile, i) => {
            const handle = inputHandles[i];
            const originalBuffer = originalBuffers[i];

            console.log(`\n--- Testing ${testFile.name} (${originalBuffer.length} bytes) ---`);

            // Check import progress
            const importProgress = fileImports[handle];
            expect(importProgress).toBeDefined();
            expect(importProgress.done).toBe(true);

            // Check exported blob
            const exportedBlob = fileExports[handle];
            expect(exportedBlob).toBeDefined();
            expect(exportedBlob).toHaveProperty("handle");
            expect(exportedBlob).toHaveProperty("size");
            expect(exportedBlob.size).toBe(originalBuffer.length);

            await Promise.all([
              testChunkedDownload(originalBuffer, exportedBlob, 13),
              testChunkedDownload(originalBuffer, exportedBlob, 5),
              testChunkedDownload(originalBuffer, exportedBlob, 20),
              testChunkedDownload(originalBuffer, exportedBlob, 1),
              testChunkedDownload(originalBuffer, exportedBlob, 2),
            ]);

            console.log(`✅ All tests passed for ${testFile.name}`);
          }),
        );

        console.log("\n=== All transfer-files tests completed successfully ===");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return;
      }
    }
  },
);

blockTest(
  "v3: transfer-files big files",
  { timeout: 600000 },
  async ({ rawPrj: project, ml, tmpFolder, expect }) => {
    const blockId = await project.addBlock("TransferFiles", transferFilesSpec);

    // Helper function to create random buffer
    const createRandomBuffer = (size: number): Buffer => {
      const buffer = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = Math.floor(Math.random() * 256);
      }
      return buffer;
    };

    // Helper function to compute hash incrementally for large buffers
    const computeHashIncremental = (buffer: Buffer): string => {
      const hasher = createHash("sha256");
      const chunkSize = 64 * 1024 * 1024; // 64 MB chunks
      for (let offset = 0; offset < buffer.length; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, buffer.length);
        hasher.update(buffer.subarray(offset, end));
      }
      return hasher.digest("hex");
    };

    // Helper function to compare buffers in chunks
    const compareBuffersInChunks = (buffer1: Buffer, buffer2: Buffer): boolean => {
      if (buffer1.length !== buffer2.length) return false;

      const chunkSize = 64 * 1024 * 1024; // 64 MB chunks
      const totalChunks = Math.ceil(buffer1.length / chunkSize);
      let chunksCompared = 0;

      for (let offset = 0; offset < buffer1.length; offset += chunkSize) {
        const end = Math.min(offset + chunkSize, buffer1.length);
        const chunk1 = buffer1.subarray(offset, end);
        const chunk2 = buffer2.subarray(offset, end);

        if (!chunk1.equals(chunk2)) return false;

        chunksCompared++;
        if (chunksCompared % 20 === 0 || chunksCompared === totalChunks) {
          const progress = ((chunksCompared / totalChunks) * 100).toFixed(1);
          console.log(`    - Compared ${chunksCompared}/${totalChunks} chunks (${progress}%)`);
        }
      }

      return true;
    };

    // Create test files with known content (text and binary)
    const testFiles: Array<{ name: string; buffer: Buffer }> = [
      // Huge binary file (1 GiB) - to test size limits
      { name: "test_huge_binary.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 1) },
      { name: "test_huge_binary_2.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 2) },
      { name: "test_huge_binary_3.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 3) },
      { name: "test_huge_binary_4.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 4) },
      { name: "test_huge_binary_5.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 5) },
      { name: "test_huge_binary_6.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 6) },
      { name: "test_huge_binary_7.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 7) },
      { name: "test_huge_binary_8.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 8) },
      { name: "test_huge_binary_9.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 9) },
      { name: "test_huge_binary_10.bin", buffer: createRandomBuffer(33 * 1024 * 1024 + 10) },
    ];

    const inputHandles: ImportFileHandle[] = [];
    const originalBuffers: Buffer[] = [];

    // Create temporary files and get their handles
    const storages = await ml.driverKit.lsDriver.getStorageList();
    const local = storages.find((s) => s.name == "local");
    expect(local).not.toBeUndefined();

    const testDir = path.join(tmpFolder, "test-files");
    await fsp.mkdir(testDir, { recursive: true });
    console.log("Created test directory:", testDir);

    for (const testFile of testFiles) {
      const filePath = path.join(testDir, testFile.name);
      await fsp.writeFile(filePath, testFile.buffer);
      console.log(`Created test file: ${testFile.name} (${testFile.buffer.length} bytes)`);
      originalBuffers.push(testFile.buffer);

      const files = await ml.driverKit.lsDriver.listFiles(local!.handle, testDir);
      const ourFile = files.entries.find((f) => f.name == testFile.name);
      expect(ourFile).not.toBeUndefined();
      expect(ourFile?.type).toBe("file");

      inputHandles.push((ourFile as any).handle);
    }

    // transfer-files is a V3 block (modelAPIVersion 2); the deprecated
    // setBlockArgs hardcodes modelAPIVersion 1 and would mismatch.
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { inputHandles },
    });
    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof transferFilesModel>;

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();

      const outputs = state.outputs;

      if (outputs.fileImports.ok && outputs.fileExports.ok) {
        const fileImports = outputs.fileImports.value;
        const fileExports = outputs.fileExports.value as Record<
          ImportFileHandle,
          RemoteBlobHandleAndSize
        >;

        console.log("\n=== File Transfer Results ===");
        console.log(`Files imported: ${Object.keys(fileImports).length}`);
        console.log(`Files exported: ${Object.keys(fileExports).length}`);

        expect(Object.keys(fileImports).length).toBe(testFiles.length);
        expect(Object.keys(fileExports).length).toBe(testFiles.length);

        await Promise.allSettled(
          testFiles.map(async (testFile, i) => {
            const handle = inputHandles[i];
            const originalBuffer = originalBuffers[i];

            console.log(`\n--- Testing ${testFile.name} (${originalBuffer.length} bytes) ---`);

            const importProgress = fileImports[handle];
            expect(importProgress).toBeDefined();
            expect(importProgress.done).toBe(true);

            const exportedBlob = fileExports[handle];
            expect(exportedBlob).toBeDefined();
            expect(exportedBlob).toHaveProperty("handle");
            expect(exportedBlob).toHaveProperty("size");
            expect(exportedBlob.size).toBe(originalBuffer.length);

            {
              console.log("Chunked download with hash verification");

              const chunkSize = 1024 * 1024; // 1 MiB chunks
              const totalChunks = Math.ceil(originalBuffer.length / chunkSize);

              console.log(
                `    - Downloading ${originalBuffer.length} bytes in ${totalChunks} chunks of ${chunkSize} bytes`,
              );

              const downloadedChunks: Buffer[] = [];
              let downloadedBytes = 0;

              const startTime = Date.now();

              for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const from = chunkIndex * chunkSize;
                const to = Math.min(from + chunkSize, exportedBlob.size);
                const expectedChunkSize = to - from;

                const chunk = await ml.driverKit.blobDriver.getContent(exportedBlob.handle, {
                  from,
                  to,
                });
                const chunkBuffer = Buffer.from(chunk);

                // Verify chunk size
                if (chunkBuffer.length !== expectedChunkSize) {
                  console.error(
                    `    ❌ Chunk ${chunkIndex}: size mismatch! Expected ${expectedChunkSize}, got ${chunkBuffer.length}`,
                  );
                  console.error(`       Range: from=${from}, to=${to}`);
                }

                // Verify chunk content against original
                const originalChunk = originalBuffer.subarray(from, to);
                if (!chunkBuffer.equals(originalChunk)) {
                  console.error(`    ❌ Chunk ${chunkIndex}: content mismatch!`);
                  console.error(`       Range: from=${from}, to=${to}`);
                  console.error(
                    `       First 20 bytes of original:   ${originalChunk.subarray(0, 20).toString("hex")}`,
                  );
                  console.error(
                    `       First 20 bytes of downloaded: ${chunkBuffer.subarray(0, 20).toString("hex")}`,
                  );

                  // Find first differing byte
                  for (let i = 0; i < Math.min(originalChunk.length, chunkBuffer.length); i++) {
                    if (originalChunk[i] !== chunkBuffer[i]) {
                      console.error(
                        `       First difference at byte ${i}: original=0x${originalChunk[i].toString(16)}, downloaded=0x${chunkBuffer[i].toString(16)}`,
                      );
                      break;
                    }
                  }
                }

                downloadedChunks.push(chunkBuffer);
                downloadedBytes += chunk.length;

                if ((chunkIndex + 1) % 10 === 0 || chunkIndex === totalChunks - 1) {
                  const progress = ((downloadedBytes / originalBuffer.length) * 100).toFixed(1);
                  console.log(
                    `    - Downloaded ${chunkIndex + 1}/${totalChunks} chunks (${progress}%)`,
                  );
                }
              }

              const downloadTime = Date.now() - startTime;
              const downloadSpeed = (downloadedBytes / 1024 / 1024 / (downloadTime / 1000)).toFixed(
                2,
              );
              console.log(`    - Download completed in ${downloadTime}ms (${downloadSpeed} MB/s)`);

              // Concatenate all chunks
              console.log("    - Concatenating chunks...");
              const downloadedBuffer = Buffer.concat(downloadedChunks);

              // Verify size
              expect(downloadedBuffer.length).toBe(originalBuffer.length);
              console.log(`    ✓ Downloaded size matches: ${downloadedBuffer.length} bytes`);

              // Compute hashes
              console.log("    - Computing hashes...");
              const originalHash = computeHashIncremental(originalBuffer);
              const downloadedHash = computeHashIncremental(downloadedBuffer);

              console.log(`    - Original hash:    ${originalHash}`);
              console.log(`    - Downloaded hash:  ${downloadedHash}`);

              // Verify hashes match
              expect(downloadedHash).toBe(originalHash);
              console.log("    ✓ Hashes match - data integrity verified!");

              // Additional verification: compare buffers in chunks
              console.log("    - Comparing buffers in chunks...");
              const buffersMatch = compareBuffersInChunks(originalBuffer, downloadedBuffer);
              expect(buffersMatch).toBe(true);
              console.log("    ✓ Chunk-by-chunk comparison passed!");

              console.log("  ✓ Chunked download test passed");
            }

            console.log(`✅ All tests passed for ${testFile.name}`);
          }),
        );

        console.log("\n=== All transfer-files tests completed successfully ===");
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return;
      }
    }
  },
);

blockTest(
  "v3: should create blob-url-custom-protocol block, render it and gets outputs from its config",
  { timeout: 90000 },
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock("DownloadBlobUrl", downloadBlobURLSpec);

    const inputTgzHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      "funny_cats_site.tar.gz",
    );
    const inputZipHandle = await lsDriverGetFileHandleFromAssets(ml, expect, "funny_cats_site.zip");

    // blob-url-custom-protocol is a V3 block (modelAPIVersion 2); the deprecated
    // setBlockArgs hardcodes modelAPIVersion 1 and would mismatch.
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { inputTgzHandle, inputZipHandle },
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        13000,
      )) as InferBlockState<typeof downloadBlobURLModel>;
      // console.dir(state, { depth: 5 });

      const blockFrontend = await project.getBlockFrontend(blockId).awaitStableValue();
      expect(blockFrontend).toBeDefined();
      console.dir(blockFrontend, { depth: 5 });

      const outputs = state.outputs;

      // `tgz_content` is now derived by a render lambda rather than V1's
      // config-based extractArchiveAndGetURL, so it resolves as
      // `FolderURL | undefined` — `ok` can be true before the URL is available.
      // Keep polling until the value itself settles.
      if (outputs.tgz_content.ok && outputs.tgz_content.value !== undefined) {
        const url = outputs.tgz_content.value;
        console.dir(ml.internalDriverKit.blobToURLDriver.info(), { depth: 150 });

        const defaultUrl = ml.internalDriverKit.blobToURLDriver.getPathForCustomProtocol(url);
        expect(defaultUrl).matches(/.*index.html$/);

        const styles = ml.internalDriverKit.blobToURLDriver.getPathForCustomProtocol(
          (url + "/styles.css") as FolderURL,
        );

        expect(styles).matches(/.*\/styles.css/);

        return;
      }
    }
  },
);

blockTest(
  "v3: should create upload-file block, render it and upload a file to pl server",
  async ({ rawPrj: project, ml, expect }) => {
    const blockId = await project.addBlock("UpdateFile", uploadFileSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      "another_answer_to_the_ultimate_question.txt",
    );

    // upload-file is a V3 block (modelAPIVersion 2); the deprecated
    // setBlockArgs hardcodes modelAPIVersion 1 and would mismatch.
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { inputHandle },
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof uploadFileModel>;

      // console.dir(state, { depth: 5 });

      const outputs = state.outputs;
      if (outputs.handle.ok && outputs.handle.value != undefined) {
        expect(outputs.handle.value.isUpload).toBeTruthy();
        expect(outputs.handle.value.done).toBeTruthy();
        return;
      }
    }
  },
);

blockTest(
  "v3: should create read-logs block, render it and read logs from a file",
  // pl-core downloads a software for this test and then runs it, and on a Kubernetes deploy
  // that run is a pod scheduled and an image pulled. 20s covered neither and the case reported
  // a bare timeout. The sibling that only renders a block already takes 90s, and the two that
  // download take 600s.
  { timeout: 300000 },
  async ({ rawPrj: project, ml, helpers: _helpers, expect }) => {
    const blockId = await project.addBlock("ReadLogs", readLogsSpec);

    const inputHandle = await lsDriverGetFileHandleFromAssets(
      ml,
      expect,
      "maybe_the_number_of_lines_is_the_answer.txt",
    );

    // read-logs is a V3 block (modelAPIVersion 2); the deprecated setBlockArgs
    // hardcodes modelAPIVersion 1 and would mismatch.
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: {
        inputHandle,
        // args are from here:
        // https://github.com/milaboratory/sleep/blob/3c046cdcc504b63f1a6e592a4aa87ee773a94d72/read-file-to-stdout-with-sleep.go#L24
        readFileWithSleepArgs: "PREFIX,100,1000",
      },
    });

    await project.runBlock(blockId);

    while (true) {
      const state = (await awaitStableState(
        project.getBlockState(blockId),
        25000,
      )) as InferBlockState<typeof readLogsModel>;

      // console.dir(state, { depth: 5 });
      const outputs = state.outputs;

      if (outputs.lastLogs.ok && outputs.lastLogs.value != undefined) {
        expect((outputs.progressLog as any).value).toContain("PREFIX");
        expect((outputs.progressLog as any).value).toContain("bytes read");
        expect((outputs.lastLogs as any).value.split("\n").length).toEqual(10 + 1); // 11 because the last element is empty
        return;
      }
    }
  },
);

async function lsDriverGetFileHandleFromAssets(
  ml: MiddleLayer,
  expect: any,
  fName: string,
): Promise<ImportFileHandle> {
  const storages = await ml.driverKit.lsDriver.getStorageList();

  const local = storages.find((s) => s.name == "local");
  expect(local).not.toBeUndefined();

  const fileDir = path.resolve(__dirname, "..", "..", "..", "assets");
  const files = await ml.driverKit.lsDriver.listFiles(local!.handle, fileDir);

  const ourFile = files.entries.find((f) => f.name == fName);
  expect(ourFile).not.toBeUndefined();
  expect(ourFile?.type).toBe("file");

  return (ourFile as any).handle;
}
