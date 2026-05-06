# block-beta-sum-numbers

Pre-built block fixture for backward-compatibility testing.

Used by `block_pack.test.ts` ("test load template from 'dev-v1'") to verify
that the middle layer can still load blocks packaged in the legacy `dev-v1`
format (config/, backend/, frontend/ layout).

The `dist/` directories contain committed build artifacts because the test
resolves them at runtime via `tryResolve`. Without these files the fixture
is incomplete and the test fails.

Do not delete the build artifacts unless the corresponding test is removed.
