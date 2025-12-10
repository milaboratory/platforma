# platforma-sdk

# Build

To build all the artefacts in the repository just:

```
pnpm i
pnpm build
```

# Testing

For test running you have to launch platfrom backend first:
```bash 
pl-dev svc create local s3 dev \
  --storage-library="$(pwd)/assets/" \
  --auth-enabled;
pl-dev svc up dev
```
Binary way
```bash
./platforma --license *** --data-library-fs=library=/path/to/platforma/assets
```

And after that you should start test with envs:
```bash 
 PL_ADDRESS="http://127.0.0.1:6345" \ 
 PL_TEST_USER="test-user" \
 PL_TEST_PASSWORD="test-password" \
 pnpm test
```
With token
```bash 
 PL_ADDRESS="http://127.0.0.1:6345" \ 
 PL_TEST_USER="default" \
 PL_TEST_PASSWORD="*token*" \
 pnpm test
```

# Fighting strange build errors

If after multiple pulls and `pnpm install`-s you encounter strange build errors, don't remove `pnpm-lock.yaml` file, do this instead:

```
git clean -dfX
pnpm i
pnpm build
```
