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

### Dev container
The command starts a docker container for dev:
```sh
pnpm run dev-docker
# in another terminal you can start bash
pnpm run exec-dev-docker
```
Credentials:
127.0.0.1:4343
pl-doctor
password

### supervisor commands
Go to SSH server, then to `~/.platforma_ssh` and check the status of binary:
```sh
./binaries/supervisord-0.7.3-amd64/supervisord_0.7.3_Linux_64-bit/supervisord -c supervisor.conf ctl status
```

To shutdown platforma:
```sh
./binaries/supervisord-0.7.3-amd64/supervisord_0.7.3_Linux_64-bit/supervisord -c supervisor.conf ctl shutdown
```