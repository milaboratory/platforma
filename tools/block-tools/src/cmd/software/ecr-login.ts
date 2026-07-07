import { spawnSync } from "node:child_process";
import * as os from "node:os";
import {
  ECRPUBLICClient as EcrPublicClient,
  GetAuthorizationTokenCommand,
} from "@aws-sdk/client-ecr-public";
import { util, defaults, type Logger } from "@platforma-sdk/package-builder-lib";

const PUBLIC_ECR_HOST = "public.ecr.aws";
// ECR Public's API is served only from us-east-1, independent of where images are pulled.
const PUBLIC_ECR_REGION = "us-east-1";

// Pin AWS_PROFILE once so the ECR client and the S3 upload resolve identical credentials.
// Env credentials (CI) and an explicit AWS_PROFILE take precedence and skip this.
export function ensureAwsProfile(logger?: Logger): void {
  if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE) return;
  const profile = process.env.PL_AWS_PROFILE ?? defaults.AWS_DEV_PROFILE;
  process.env.AWS_PROFILE = profile;
  logger?.debug(`Using AWS profile '${profile}' for dev push credentials`);
}

// Host of a scheme-less registry ref: public.ecr.aws/u5p1x5q2/pl-containers -> public.ecr.aws
function registryHost(registry: string): string {
  return new URL(`https://${registry}`).hostname;
}

function ssoLoginHint(): string {
  const profile = process.env.AWS_PROFILE ?? process.env.PL_AWS_PROFILE ?? defaults.AWS_DEV_PROFILE;
  return `  aws sso login --profile ${profile}`;
}

// docker login to public ECR with an SDK-fetched token. No cached-auth check — re-authenticates
// every call, so an expired/absent session fails here with a recoverable hint, not opaquely at push.
export async function ensureEcrLogin(registry: string, logger?: Logger): Promise<void> {
  const host = registryHost(registry);
  if (host !== PUBLIC_ECR_HOST) {
    // Public ECR is the only dev docker registry; reject a mis-set ecr:// override.
    throw util.CLIError(
      `automatic docker login is only supported for '${PUBLIC_ECR_HOST}', not '${host}'.\n` +
        `Log in manually, or drop the ecr:// scheme from the push target to opt out.`,
    );
  }

  logger?.info(`Logging in to ECR registry '${host}'...`);

  let user: string;
  let password: string;
  try {
    const client = new EcrPublicClient({ region: PUBLIC_ECR_REGION });
    const res = await client.send(new GetAuthorizationTokenCommand({}));
    const token = res.authorizationData?.authorizationToken;
    if (!token) throw new Error("empty authorization token");
    // Token decodes to "AWS:<password>"; password may contain ':', so split on the first only.
    const decoded = Buffer.from(token, "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep < 0) throw new Error(`malformed authorization token (no ':' separator)`);
    user = decoded.slice(0, sep);
    password = decoded.slice(sep + 1);
  } catch (e) {
    throw util.CLIError(
      `failed to obtain an ECR login token for '${host}': ${e instanceof Error ? e.message : String(e)}\n` +
        `Your AWS/SSO session is likely expired or absent — log in and retry:\n` +
        ssoLoginHint(),
    );
  }

  const login = spawnSync("docker", ["login", "--username", user, "--password-stdin", host], {
    input: password,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, HOME: process.env.HOME || os.homedir() },
  });
  if (login.error || login.status !== 0) {
    throw util.CLIError(`'docker login ${host}' failed`);
  }
}
