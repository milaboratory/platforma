# pl-deployments

## Test tips

### Regenerate `ssh` keys
`ssh2` lib has a way to generate private and public ssh keys.

`cd` into pl-deployments and then run it in `node` repl:

```js
let keys = require("ssh2").utils.generateKeyPairSync('ecdsa', { bits: 256, comment: 'node.js rules!', passphrase: 'password', cipher: 'aes256-cbc' });

require("fs").writeFileSync('test-assets/public-key.pem', keys.public);
require("fs").writeFileSync('test-assets/private-key.pem', keys.private);
```

### Clean docker containers
If something went wrong with testcontainers, use `pnpm run cleanup-docker` from pl-deployments root.