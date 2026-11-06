import { describe, test, expect } from "vitest";
import { Client } from "ssh2";
import type { MiLogger } from "@milaboratories/ts-helpers";
import { SshClient } from "./ssh";
import type { SshExecResult } from "./ssh";
import { SshPl } from "./pl";
import { newConnectionInfo, parseConnectionInfo, stringifyConnectionInfo } from "./connection_info";

const secret = "fedcba9876543210fedcba9876543210";

class RecordingLogger implements MiLogger {
  public readonly lines: string[] = [];
  info(msg: unknown) {
    this.lines.push(String(msg));
  }
  warn(msg: unknown) {
    this.lines.push(String(msg));
  }
  error(msg: unknown) {
    this.lines.push(String(msg));
  }
}

/** An SSH client answering the commands SshPl sends, without a connection. */
class FakeSshClient extends SshClient {
  constructor(
    logger: MiLogger,
    private readonly answer: (command: string) => SshExecResult,
    private readonly files: Record<string, string>,
  ) {
    super(logger, new Client());
  }

  override async exec(command: string): Promise<SshExecResult> {
    return this.answer(command);
  }

  override async readFile(remotePath: string): Promise<string> {
    const name = Object.keys(this.files).find((f) => remotePath.endsWith(f));
    if (name === undefined) throw new Error(`no such file: ${remotePath}`);
    return this.files[name];
  }
}

function commonAnswers(command: string): SshExecResult | undefined {
  if (command.startsWith("uname")) return { stdout: "Linux\nx86_64", stderr: "" };
  if (command === "echo $HOME") return { stdout: "/home/u\n", stderr: "" };
  if (command.endsWith("ctl status"))
    return { stdout: "platforma                        Running   pid 1\n", stderr: "" };
  return undefined;
}

const ports = {
  grpc: { local: 1, remote: 2 },
  monitoring: { local: 3, remote: 4 },
  debug: { local: 5, remote: 6 },
  minioPort: { local: 7, remote: 8 },
  minioConsolePort: { local: 9, remote: 10 },
};

async function initError(sshClient: SshClient, logger: RecordingLogger): Promise<string> {
  const pl = new SshPl(logger, sshClient, "u");
  try {
    await pl.platformaInit({ localWorkdir: "/tmp/w", license: { type: "env" } });
  } catch (e: unknown) {
    return String(e);
  }
  throw new Error("platformaInit was expected to fail");
}

describe("SshPl.platformaInit failure", () => {
  test("state in the logged and thrown error carries no credentials", async () => {
    const logger = new RecordingLogger();
    const connection = newConnectionInfo("default-user", secret, ports, false, "0.0.1", false);
    const client = new FakeSshClient(
      logger,
      (command) => {
        const answer = commonAnswers(command);
        if (answer) return answer;
        if (command.endsWith("ctl shutdown")) throw new Error("shutdown failed");
        throw new Error(`unexpected command ${command}`);
      },
      { "connection.txt": stringifyConnectionInfo(connection) },
    );

    const thrown = await initError(client, logger);

    expect(thrown).toContain("shutdown failed");
    expect(thrown).toContain('"existedSettings":{"plUser":"default-user"');
    expect(thrown).not.toContain(secret);
    expect(logger.lines.join("\n")).not.toContain(secret);
  });

  test("the caught error's text is redacted", async () => {
    const logger = new RecordingLogger();
    const client = new FakeSshClient(
      logger,
      () => {
        throw new Error(`ssh.exec: connect via http://u:${secret}@proxy failed`);
      },
      {},
    );

    const thrown = await initError(client, logger);

    expect(thrown).toContain("http://u:***@proxy");
    expect(thrown).not.toContain(secret);
    expect(logger.lines.join("\n")).not.toContain(secret);
  });
});

test("SshPl.start forwards platforma cli logs with credentials masked", async () => {
  const logger = new RecordingLogger();
  const cliLogs = `starting\nMINIO_ROOT_PASSWORD=${secret}\ndb postgres://pl:${secret}@db/pl\ndone`;
  const client = new FakeSshClient(
    logger,
    (command) => {
      if (command.endsWith("ctl status")) return { stdout: "", stderr: "" };
      const answer = commonAnswers(command);
      if (answer) return answer;
      if (command.endsWith("--daemon")) return { stdout: "", stderr: "daemon failed" };
      throw new Error(`unexpected command ${command}`);
    },
    { "platforma_cli_logs.log": cliLogs },
  );

  const pl = new SshPl(logger, client, "u");
  const thrown = await pl.start(false).then(
    () => "",
    (e: unknown) => String(e),
  );

  expect(thrown).toContain("daemon failed");
  expect(thrown).toContain("starting\nMINIO_ROOT_PASSWORD=***\ndb postgres://pl:***@db/pl\ndone");
  expect(thrown).not.toContain(secret);
  expect(logger.lines.join("\n")).not.toContain(secret);
});

/** Every 6-character piece of the secret: a parser snippet may quote only a part of it. */
function expectNoPartOfSecret(text: string) {
  for (let i = 0; i + 6 <= secret.length; i++) expect(text).not.toContain(secret.slice(i, i + 6));
}

test.each([
  ["invalid JSON", `{"plUser": "u", "plPassword": ${secret}}`],
  ["schema mismatch", JSON.stringify({ plUser: "u", plPassword: [secret], ports })],
])("parseConnectionInfo errors do not quote the password (%s)", (_, content) => {
  let message = "";
  try {
    parseConnectionInfo(content);
  } catch (e: unknown) {
    message = String(e);
  }
  expect(message).toContain("can not parse connection info");
  expectNoPartOfSecret(message);
});
