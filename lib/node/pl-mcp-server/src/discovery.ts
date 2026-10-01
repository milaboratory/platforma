import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export function mcpDiscoveryFilePath(): string {
  return join(homedir(), ".platforma", "mcp-server.json");
}

export class DiscoveryFile {
  constructor(private readonly filePath: string) {}

  async publish(url: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const staging = `${this.filePath}.${randomUUID()}`;
    await writeFile(staging, `${JSON.stringify({ url })}\n`, { mode: 0o600 });
    await rename(staging, this.filePath);
  }

  async remove(): Promise<void> {
    try {
      await unlink(this.filePath);
    } catch (error: unknown) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
}
