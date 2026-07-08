import { describe, it, expect, afterEach, vi } from "vitest";
import { defaults } from "@platforma-sdk/package-builder-lib";

// Mock the AWS SDK client and docker CLI so nothing touches the network or a real docker daemon.
const { sendMock, spawnMock } = vi.hoisted(() => ({ sendMock: vi.fn(), spawnMock: vi.fn() }));
vi.mock("@aws-sdk/client-ecr-public", () => ({
  ECRPUBLICClient: class {
    send = sendMock;
  },
  GetAuthorizationTokenCommand: class {},
}));
vi.mock("node:child_process", () => ({ spawnSync: spawnMock }));

const { ensureAwsProfile, ensureEcrLogin } = await import("./ecr-login");

const DEV_ECR = "public.ecr.aws/miresearch/pl-containers";
const token = (raw: string) => Buffer.from(raw, "utf8").toString("base64");
const authOk = (raw: string) => ({ authorizationData: { authorizationToken: token(raw) } });

afterEach(() => {
  for (const k of ["AWS_ACCESS_KEY_ID", "AWS_PROFILE", "PL_AWS_PROFILE"]) delete process.env[k];
  vi.clearAllMocks();
});

describe("ensureAwsProfile — credential-chain selection", () => {
  it("does nothing when env credentials are present (the CI path)", () => {
    process.env.AWS_ACCESS_KEY_ID = "AKIA...";
    ensureAwsProfile();
    expect(process.env.AWS_PROFILE).toBeUndefined();
  });

  it("leaves an explicit AWS_PROFILE untouched", () => {
    process.env.AWS_PROFILE = "my-profile";
    ensureAwsProfile();
    expect(process.env.AWS_PROFILE).toBe("my-profile");
  });

  it("prefers PL_AWS_PROFILE over the built-in default", () => {
    process.env.PL_AWS_PROFILE = "custom-dev";
    ensureAwsProfile();
    expect(process.env.AWS_PROFILE).toBe("custom-dev");
  });

  it("falls back to the built-in dev profile when nothing is set", () => {
    ensureAwsProfile();
    expect(process.env.AWS_PROFILE).toBe(defaults.AWS_DEV_PROFILE);
  });
});

describe("ensureEcrLogin", () => {
  it("rejects a non-public.ecr.aws host", async () => {
    await expect(ensureEcrLogin("quay.io/milaboratories/pl")).rejects.toThrow(/public\.ecr\.aws/);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("logs in with the decoded token, splitting only on the first colon", async () => {
    sendMock.mockResolvedValue(authOk("AWS:pass:with:colons"));
    spawnMock.mockReturnValue({ status: 0 });

    await ensureEcrLogin(DEV_ECR);

    expect(spawnMock).toHaveBeenCalledWith(
      "docker",
      ["login", "--username", "AWS", "--password-stdin", "public.ecr.aws"],
      expect.objectContaining({ input: "pass:with:colons" }),
    );
  });

  it("throws a recoverable SSO hint when the token is empty (expired/absent session)", async () => {
    sendMock.mockResolvedValue({ authorizationData: { authorizationToken: undefined } });
    await expect(ensureEcrLogin(DEV_ECR)).rejects.toThrow(/aws sso login/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("throws on a malformed token with no ':' separator", async () => {
    sendMock.mockResolvedValue(authOk("no-colon-here"));
    await expect(ensureEcrLogin(DEV_ECR)).rejects.toThrow(/aws sso login/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("throws when `docker login` exits non-zero", async () => {
    sendMock.mockResolvedValue(authOk("AWS:pw"));
    spawnMock.mockReturnValue({ status: 1 });
    await expect(ensureEcrLogin(DEV_ECR)).rejects.toThrow(/docker login.*failed/);
  });

  it("throws when spawning docker errors", async () => {
    sendMock.mockResolvedValue(authOk("AWS:pw"));
    spawnMock.mockReturnValue({ error: new Error("ENOENT"), status: null });
    await expect(ensureEcrLogin(DEV_ECR)).rejects.toThrow(/docker login.*failed/);
  });
});
