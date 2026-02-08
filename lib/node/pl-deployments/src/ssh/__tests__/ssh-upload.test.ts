import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { SshClient } from "../ssh";
import { ConsoleLoggerAdapter } from "@milaboratories/ts-helpers";
import type { SFTPWrapper } from "ssh2";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("mocked SSHClient", () => {
  let testFilePath: string;
  let remoteFilePath: string;

  beforeEach(async () => {
    // Create a temporary test file
    testFilePath = join(tmpdir(), `test-upload-${Date.now()}.txt`);
    await writeFile(testFilePath, "test content");
    remoteFilePath = `/tmp/test-upload-${Date.now()}.txt`;
  });

  afterEach(async () => {
    // Cleanup test file
    try {
      await unlink(testFilePath);
    } catch {
      // Ignore cleanup errors
    }
  });

  test("should retry upload in case of a failure", async () => {
    const logger = new ConsoleLoggerAdapter();

    // Track upload attempts
    let uploadAttempt = 0;

    // Create a mock SFTP wrapper
    const mockSftp = {
      fastPut: vi.fn(
        (localPath: string, remotePath: string, callback: (err: Error | null) => void) => {
          uploadAttempt++;

          if (uploadAttempt === 1) {
            // First attempt: return 'Failure' error (generic failure that triggers retry)
            const failureError = new Error("Failure");
            callback(failureError);
          } else if (uploadAttempt === 2) {
            // Second attempt: accept upload (callback succeeds, but file is dropped/not saved per requirements)
            // The test expects successful upload, so we simulate success
            callback(null);
          } else {
            callback(new Error("Unexpected error, too many attempts"));
          }
        },
      ),
      end: vi.fn(),
    } as unknown as SFTPWrapper;

    // Create a mock SSH2 Client
    const mockSsh2Client = {
      sftp: vi.fn((callback: (err: Error | null, sftp: SFTPWrapper) => void) => {
        callback(null, mockSftp);
      }),
      end: vi.fn(),
    } as any;

    // Create SshClient instance with mocked client
    // We bypass the init method and directly use constructor since we're mocking
    const sshClient = new SshClient(logger, mockSsh2Client);

    // The upload should succeed on the second attempt
    const result = await sshClient.uploadFile(testFilePath, remoteFilePath);

    expect(result).toBe(true);
    expect(uploadAttempt).toBe(2); // Should succeed on 2nd attempt
    expect(mockSftp.fastPut).toHaveBeenCalledTimes(2);
    expect(mockSftp.fastPut).toHaveBeenNthCalledWith(
      1,
      testFilePath,
      remoteFilePath,
      expect.any(Function),
    );
    expect(mockSftp.fastPut).toHaveBeenNthCalledWith(
      2,
      testFilePath,
      remoteFilePath,
      expect.any(Function),
    );
  });
});
