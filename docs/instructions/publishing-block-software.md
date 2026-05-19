# Publishing Block-Software Images

Push a block's software Docker images to `public.ecr.aws/u5p1x5q2/pl-containers` so the K8s Platforma can run a dev block.

## You Need

```bash
brew install --cask docker   # Docker Desktop
brew install awscli          # AWS CLI v2
brew install node pnpm       # Node 20+ and pnpm
brew install python git      # Python 3 and git (usually already present)
```

## Set Up Your AWS Profile

```bash
aws configure sso             # or `aws configure` for static keys
aws sso login --profile milabs
aws sts get-caller-identity --profile milabs
```

The profile must resolve to account **934685779402**.

## Push

From `core/platforma`:

```bash
AWS_PROFILE=milabs ./scripts/deploy-block-aws.sh ../../blocks/<block>
```

The script discovers every software package and entrypoint under the block, builds `linux/amd64` images, pushes them, and rewrites `dist/artifacts/<entrypoint>/docker_x64.json` so the next `pnpm build` embeds the new image URLs in `.sw.json`.

K8s nodes pull anonymously from the public ECR — no cluster-side config needed.

## Override the Default Registry

```bash
AWS_PROFILE=milabs ./scripts/deploy-block-aws.sh ../../blocks/<block> \
    --ecr <account>.dkr.ecr.<region>.amazonaws.com/<repo> --region <region>
```

URLs matching `public.ecr.aws/*` authenticate via `aws ecr-public` in `us-east-1`; everything else uses `aws ecr` in `--region`.
