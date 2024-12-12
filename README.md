# platforma-sdk

# Build

To build all the artefacts in the repository just:

```
pnpm i
pnpm build
```

# Fighting strange build errors

If after multiple pulls and `pnpm install`-s you encounter strange build errors, don't remove `pnpm-lock.yaml` file, do this instead:

```
git clean -dfX
pnpm i
pnpm build
```
