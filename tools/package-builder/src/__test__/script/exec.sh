#!/bin/env bash

pnpm build
pnpm i @platforma-open/milaboratories.runenv-python-3
npx pl-pkg build all --package-root ./src/__test__