import { describe, test, expect } from "vitest";
import { SFTPError, SSHError, SFTPUploadError } from "./ssh_errors";

test("error chain unwrapping works", () => {
  const err = new Error("Failure");
  const uploadErr = new SFTPUploadError(err, "localPath", "remotePath");
  const finalErr = new Error(`Problem: ${uploadErr.message}`, { cause: uploadErr });

  expect(SFTPUploadError.from(finalErr)).toBe(uploadErr);
  expect(SFTPError.from(finalErr)).toBeDefined();
  expect(SSHError.from(finalErr)).toBeDefined();
});

describe("SSHError", () => {
  test("should add prefix to error message", () => {
    const err = new SSHError("Test error");
    expect(err.message).toBe("SSHError: Test error");
  });

  test("should respect cause option", () => {
    const cause = new Error("Cause error");
    const err = new SSHError("Test error", { cause });
    expect(err.cause).toBe(cause);
  });

  test("should preserve original error as cause", () => {
    const cause = new Error("Cause error");
    const err = new SSHError(cause);
    expect(err.cause).toBe(cause);
  });
});

describe("SFTPError.wrap()", () => {
  test("should return undefined when err is undefined", () => {
    const result = SFTPError.wrap(undefined);
    expect(result).toBeUndefined();
  });

  test("should return the same error when err is already an SFTPError", () => {
    const sftpErr = new SFTPError("Failure");
    const result = SFTPError.wrap(sftpErr);
    expect(result).toBe(sftpErr);
  });

  test("should wrap a regular Error in SFTPError", () => {
    const regularErr = new Error("Some error message");
    const result = SFTPError.wrap(regularErr);

    expect(result).toBeInstanceOf(SFTPError);
    expect(result).not.toBe(regularErr);
    expect(result?.code).toBe("Some error message");
    expect(result?.cause).toBe(regularErr);
  });

  test("should return existing SFTPError when err has SFTPError in cause chain", () => {
    const originalSftpErr = new SFTPError("Permission denied");
    const wrappedErr = new Error("Outer error", { cause: originalSftpErr });
    const result = SFTPError.wrap(wrappedErr);

    expect(result).toBe(originalSftpErr);
  });

  test("should wrap SSHError that is not SFTPError", () => {
    const sshErr = new SSHError("SSH connection failed");
    const result = SFTPError.wrap(sshErr);

    expect(result).toBeInstanceOf(SFTPError);
    expect(result).not.toBe(sshErr);
    expect(result?.code).toBe("SSHError: SSH connection failed");
    expect(result?.cause).toBe(sshErr);
  });

  test("should wrap error with SFTPError deep in cause chain", () => {
    const originalSftpErr = new SFTPError("File not found");
    const intermediateErr1 = new Error("Intermediate 1", { cause: originalSftpErr });
    const intermediateErr2 = new Error("Intermediate 2", { cause: intermediateErr1 });
    const finalErr = new Error("Final error", { cause: intermediateErr2 });
    const result = SFTPError.wrap(finalErr);

    expect(result).toBe(originalSftpErr);
  });

  test("should preserve error message when wrapping", () => {
    const err = new Error("Custom error message");
    const result = SFTPError.wrap(err);

    expect(result?.code).toBe("Custom error message");
    expect(result?.message).toContain("Custom error message");
  });
});
