# Pl URL

```
http(s)://address:port/?...parameters...
```

Parameters:

- **alternative-root** - alternative root (description will be added / ask pl team / see client initialization code)
- **request-timeout** - default unary request timeout
- **tx-timeout** - default transaction timeout
- **grpc-proxy** - if specified, this address will be used to route grpc traffic via proxy
- **http-proxy** - if specified, this address will be used to route http traffic via proxy

Example:

```
http(s)://address:port/alternative-root=tmproot&request-timeout=10000
```

# How to pull and build proto files

Dependencies:

- `protoc`
    - `brew install protobuf`
- you don't need `protoc-gen-js`, just run `npm install`
- `protodep`
    - `go install github.com/milaboratory/protodep@v0.1.7-milab`

      check that you have `${HOME}/go/bin` in `PATH`
- `rsync`

```bash
./sync-proto.sh
```

# Running tests

Unauthenticated

```
PL_ADDRESS="http://127.0.0.1:6345" npm run test
```

Authenticated

```
PL_ADDRESS="http://127.0.0.1:6345" PL_TEST_USER="test-user" PL_TEST_PASSWORD="test-password" npm run test
```

Authentication information (token) cached in git-ignored `.test_auth.json` file.

# FAQ

## mapfile
Default bash version on MacOS is 3. mapfile apprears only from 4. To fix issue with `command not found: mapfile` you should install and redeclare bash: 
1. install bash with brew, it will install version 5
2. ln -s $(brew --prefix)/bin/bash /usr/local/bin/bash   