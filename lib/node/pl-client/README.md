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

Before running tests:
  - set environment variables 

execute `npm run test-setup`.

```
PL_ADDRESS="http://127.0.0.1:6345" npm run test-setup
```
