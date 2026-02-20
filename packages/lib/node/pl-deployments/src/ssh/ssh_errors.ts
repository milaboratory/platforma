import { findNamedErrorInCauses } from "@milaboratories/ts-helpers";

const MAX_UNWRAP_DEPTH = 10;

export class SSHError extends Error {
  name = "SSHError";

  constructor(message: string, opts?: { cause: Error });
  constructor(err: Error);
  constructor(messageOrErr: string | Error, opts?: { cause: Error }) {
    if (messageOrErr instanceof Error) {
      super(`SSHError: ${messageOrErr.message}`, { cause: opts?.cause ?? messageOrErr });
    } else {
      super(`SSHError: ${messageOrErr}`, opts);
    }
  }

  static from(err: unknown): SSHError | undefined {
    return findNamedErrorInCauses(err, SSHError, MAX_UNWRAP_DEPTH);
  }
}

export class SFTPError extends SSHError {
  name = "SFTPError";

  constructor(
    public readonly code: string, // raw SFTP error code, i.e. from OpenSSH server
    opts?: { cause: Error },
  ) {
    super(code, opts);
  }

  /** Optionally wraps an error into SFTPError, if it is not already of this type */
  static wrap(err: Error): SFTPError;
  static wrap(err: undefined): undefined;
  static wrap(err: Error | undefined): SFTPError | undefined {
    if (!err) return undefined;
    const sftpErr = SFTPError.from(err);
    if (sftpErr) return sftpErr;
    return new SFTPError(err.message, { cause: err });
  }

  static from(err: unknown): SFTPError | undefined {
    return findNamedErrorInCauses(err, SFTPError, MAX_UNWRAP_DEPTH);
  }

  public get isGenericFailure(): boolean {
    // OpenSSH server returns this message in case of general failure.
    // See https://github.com/openssh/openssh-portable/blob/1cc936b2fabffeac7fff14ca1070d7d7a317ab7b/sftp-server.c#L244
    // See https://github.com/openssh/openssh-portable/blob/1cc936b2fabffeac7fff14ca1070d7d7a317ab7b/sftp-common.c#L195
    return this.code === "Failure";
  }
}

export class SFTPUploadError extends SSHError {
  name = "SFTPUploadError";

  constructor(
    err: Error,
    public readonly localPath: string,
    public readonly remotePath: string,
  ) {
    super(`ssh.uploadFile: ${err.message}, localPath: ${localPath}, remotePath: ${remotePath}`, {
      cause: SFTPError.wrap(err),
    });
  }

  static from(err: unknown): SFTPUploadError | undefined {
    return findNamedErrorInCauses(err, SFTPUploadError, MAX_UNWRAP_DEPTH);
  }
}
