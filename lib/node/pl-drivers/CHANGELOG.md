# @milaboratories/pl-drivers

## 1.11.47

### Patch Changes

- a6ea24f: silent ci tests
- Updated dependencies [a6ea24f]
  - @milaboratories/pl-model-common@1.24.5
  - @milaboratories/computable@2.8.4
  - @milaboratories/pl-client@2.16.28
  - @milaboratories/pl-tree@1.8.36
  - @milaboratories/ts-helpers@1.7.2
  - @milaboratories/helpers@1.13.2

## 1.11.46

### Patch Changes

- f89a883: full integration oxc
- Updated dependencies [f89a883]
  - @milaboratories/computable@2.8.3
  - @milaboratories/ts-helpers@1.7.1
  - @milaboratories/pl-client@2.16.27
  - @milaboratories/pl-model-common@1.24.4
  - @milaboratories/pl-tree@1.8.35
  - @milaboratories/helpers@1.13.1

## 1.11.45

### Patch Changes

- 5e95dca: Do not set empty HTTP header to checksum in part uploads

## 1.11.44

### Patch Changes

- Updated dependencies [0099ff7]
  - @milaboratories/pl-model-common@1.24.3
  - @milaboratories/pl-client@2.16.26
  - @milaboratories/pl-tree@1.8.34

## 1.11.43

### Patch Changes

- Updated dependencies [4713838]
  - @milaboratories/pl-model-common@1.24.2
  - @milaboratories/pl-client@2.16.25
  - @milaboratories/pl-tree@1.8.33

## 1.11.42

### Patch Changes

- Updated dependencies [f819dfd]
  - @milaboratories/pl-model-common@1.24.1
  - @milaboratories/pl-client@2.16.24
  - @milaboratories/pl-tree@1.8.32

## 1.11.41

### Patch Changes

- f7fc2ae: Graceful Termination in tests

## 1.11.40

### Patch Changes

- Updated dependencies [a267fe8]
  - @milaboratories/ts-helpers@1.7.0
  - @milaboratories/computable@2.8.2
  - @milaboratories/pl-client@2.16.23
  - @milaboratories/pl-tree@1.8.31

## 1.11.39

### Patch Changes

- Updated dependencies [0044f7f]
  - @milaboratories/pl-client@2.16.22
  - @milaboratories/pl-tree@1.8.30

## 1.11.38

### Patch Changes

- Updated dependencies [1694d1a]
  - @milaboratories/ts-helpers@1.6.0
  - @milaboratories/pl-model-common@1.24.0
  - @milaboratories/computable@2.8.1
  - @milaboratories/pl-client@2.16.21
  - @milaboratories/pl-tree@1.8.29

## 1.11.37

### Patch Changes

- Updated dependencies [fc75a16]
- Updated dependencies [fc75a16]
- Updated dependencies [fc75a16]
  - @milaboratories/computable@2.8.0
  - @milaboratories/pl-model-common@1.23.0
  - @milaboratories/helpers@1.13.0
  - @milaboratories/pl-tree@1.8.28
  - @milaboratories/pl-client@2.16.20

## 1.11.36

### Patch Changes

- Updated dependencies [88f33fa]
  - @milaboratories/pl-model-common@1.22.0
  - @milaboratories/pl-client@2.16.19
  - @milaboratories/pl-tree@1.8.27

## 1.11.35

### Patch Changes

- Updated dependencies [edbbd2e]
  - @milaboratories/pl-client@2.16.18
  - @milaboratories/pl-tree@1.8.26

## 1.11.34

### Patch Changes

- Updated dependencies [2762d16]
  - @milaboratories/pl-client@2.16.17
  - @milaboratories/pl-tree@1.8.25

## 1.11.33

### Patch Changes

- Updated dependencies [2dc3476]
  - @milaboratories/pl-client@2.16.16
  - @milaboratories/pl-tree@1.8.24

## 1.11.32

### Patch Changes

- 35d3bdd: Updated logging messages to clearly indicate 'terminal error' and include the specific error code when an upload or status update is aborted due to such an error.

## 1.11.31

### Patch Changes

- Updated dependencies [4fceb9d]
  - @milaboratories/pl-client@2.16.15
  - @milaboratories/pl-tree@1.8.23

## 1.11.30

### Patch Changes

- Updated dependencies [bf86c9c]
  - @milaboratories/computable@2.7.5
  - @milaboratories/pl-tree@1.8.22

## 1.11.29

### Patch Changes

- f62e11c: Proper sparse cache disposal
- Updated dependencies [f62e11c]
  - @milaboratories/helpers@1.12.1

## 1.11.28

### Patch Changes

- Updated dependencies [6b35c32]
  - @milaboratories/pl-client@2.16.14
  - @milaboratories/pl-tree@1.8.21

## 1.11.27

### Patch Changes

- c02c206: Fix infinite retry loop in download URL driver that caused test timeouts

  The `recoverableErrorPredicate` always returned `true`, causing `URLAborted` and `DownloadNetworkError400` errors to be infinitely retried. Since `task.ts` only calls `change.markChanged()` for these specific errors before returning, `awaitChange()` would hang forever on any terminal error.

  Now terminal errors (`URLAborted`, `DownloadNetworkError400`) are not retried, while transient errors (network issues, 5xx) still are.

## 1.11.26

### Patch Changes

- Updated dependencies [5deb79a]
  - @milaboratories/pl-model-common@1.21.10
  - @milaboratories/pl-client@2.16.13
  - @milaboratories/pl-tree@1.8.20

## 1.11.25

### Patch Changes

- Updated dependencies [ebc6664]
  - @milaboratories/pl-client@2.16.12
  - @milaboratories/pl-tree@1.8.19

## 1.11.24

### Patch Changes

- Updated dependencies [ba792d4]
  - @milaboratories/pl-client@2.16.11
  - @milaboratories/pl-tree@1.8.18

## 1.11.23

### Patch Changes

- Updated dependencies [bf6fe49]
  - @milaboratories/pl-model-common@1.21.9
  - @milaboratories/pl-client@2.16.10
  - @milaboratories/pl-tree@1.8.17

## 1.11.22

### Patch Changes

- 91b17b2: Fix sparse cache

## 1.11.21

### Patch Changes

- Updated dependencies [2c07d5a]
  - @milaboratories/pl-model-common@1.21.8
  - @milaboratories/pl-client@2.16.9
  - @milaboratories/pl-tree@1.8.16

## 1.11.20

### Patch Changes

- 816fe2b: Mute sentry error

## 1.11.19

### Patch Changes

- Updated dependencies [d088e83]
  - @milaboratories/pl-model-common@1.21.7
  - @milaboratories/pl-client@2.16.8
  - @milaboratories/pl-tree@1.8.15

## 1.11.18

### Patch Changes

- Updated dependencies [17e5fe7]
  - @milaboratories/pl-model-common@1.21.6
  - @milaboratories/pl-client@2.16.7
  - @milaboratories/pl-tree@1.8.14

## 1.11.17

### Patch Changes

- Updated dependencies [8996bed]
  - @milaboratories/ts-helpers@1.5.4
  - @milaboratories/computable@2.7.4
  - @milaboratories/pl-client@2.16.6
  - @milaboratories/pl-tree@1.8.13

## 1.11.16

### Patch Changes

- Updated dependencies [6af87a6]
  - @milaboratories/ts-helpers@1.5.3
  - @milaboratories/computable@2.7.3
  - @milaboratories/pl-client@2.16.5
  - @milaboratories/pl-tree@1.8.12

## 1.11.15

### Patch Changes

- Updated dependencies [c3ce3ce]
  - @milaboratories/pl-client@2.16.4
  - @milaboratories/pl-tree@1.8.11

## 1.11.14

### Patch Changes

- Updated dependencies [55b218b]
  - @milaboratories/ts-helpers@1.5.2
  - @milaboratories/pl-model-common@1.21.5
  - @milaboratories/computable@2.7.2
  - @milaboratories/pl-client@2.16.3
  - @milaboratories/pl-tree@1.8.10

## 1.11.13

### Patch Changes

- Updated dependencies [99be920]
  - @milaboratories/pl-client@2.16.2
  - @milaboratories/pl-tree@1.8.9

## 1.11.12

### Patch Changes

- Updated dependencies [38da155]
  - @milaboratories/pl-model-common@1.21.4
  - @milaboratories/pl-client@2.16.1
  - @milaboratories/pl-tree@1.8.8

## 1.11.11

### Patch Changes

- Updated dependencies [7af7faf]
  - @milaboratories/pl-client@2.16.0
  - @milaboratories/pl-tree@1.8.7

## 1.11.10

### Patch Changes

- Updated dependencies [bb07805]
  - @milaboratories/pl-model-common@1.21.3
  - @milaboratories/pl-client@2.15.1
  - @milaboratories/pl-tree@1.8.6

## 1.11.9

### Patch Changes

- Updated dependencies [18203d0]
  - @milaboratories/helpers@1.12.0

## 1.11.8

### Patch Changes

- Updated dependencies [d5a8713]
- Updated dependencies [d5a8713]
  - @milaboratories/pl-model-common@1.21.2
  - @milaboratories/pl-client@2.15.0
  - @milaboratories/pl-tree@1.8.5

## 1.11.7

### Patch Changes

- e8adc3b: Fix Unmatched condition error, disappeared blocks
- Updated dependencies [e8adc3b]
  - @milaboratories/pl-model-common@1.21.1

## 1.11.6

### Patch Changes

- Updated dependencies [ef22c49]
- Updated dependencies [5ecb368]
  - @milaboratories/pl-model-common@1.21.0
  - @milaboratories/helpers@1.11.0

## 1.11.5

### Patch Changes

- Updated dependencies [261a742]
- Updated dependencies [a9517a8]
- Updated dependencies [a9517a8]
- Updated dependencies [d5cbbd8]
  - @milaboratories/helpers@1.10.0
  - @milaboratories/pl-client@2.14.0
  - @milaboratories/pl-tree@1.8.4

## 1.11.4

### Patch Changes

- Updated dependencies [5d4774c]
  - @milaboratories/pl-model-common@1.20.1

## 1.11.3

### Patch Changes

- Updated dependencies [25c0fed]
  - @milaboratories/ts-helpers@1.5.1
  - @milaboratories/computable@2.7.1
  - @milaboratories/pl-client@2.13.3
  - @milaboratories/pl-tree@1.8.3

## 1.11.2

### Patch Changes

- b979236: Undici tunning
  - @milaboratories/pl-client@2.13.2
  - @milaboratories/pl-tree@1.8.2

## 1.11.1

### Patch Changes

- Updated dependencies [ee46338]
  - @milaboratories/pl-client@2.13.1
  - @milaboratories/pl-tree@1.8.1

## 1.11.0

### Minor Changes

- 916de57: node version bump

### Patch Changes

- Updated dependencies [916de57]
  - @milaboratories/computable@2.7.0
  - @milaboratories/ts-helpers@1.5.0
  - @milaboratories/pl-client@2.13.0
  - @milaboratories/pl-model-common@1.20.0
  - @milaboratories/pl-tree@1.8.0
  - @milaboratories/helpers@1.9.0

## 1.10.18

### Patch Changes

- 5cc2e06: Blob download time logging
- Updated dependencies [5cc2e06]
  - @milaboratories/helpers@1.8.1

## 1.10.17

### Patch Changes

- a3b0a3e: Fix BlobDriver clipping stream to 0 length

## 1.10.16

### Patch Changes

- 349375b: Add retry on off by one error
- Updated dependencies [349375b]
  - @milaboratories/pl-client@2.12.2
  - @milaboratories/pl-tree@1.7.13

## 1.10.15

### Patch Changes

- Updated dependencies [0432c59]
  - @milaboratories/pl-client@2.12.1
  - @milaboratories/pl-tree@1.7.12

## 1.10.14

### Patch Changes

- Updated dependencies [662eee0]
  - @milaboratories/pl-model-common@1.19.19

## 1.10.13

### Patch Changes

- 49160c4: Revert BlobDriver interface
- Updated dependencies [49160c4]
  - @milaboratories/pl-model-common@1.19.18

## 1.10.12

### Patch Changes

- Updated dependencies [fc0eb68]
- Updated dependencies [fc0eb68]
  - @milaboratories/pl-client@2.12.0
  - @milaboratories/helpers@1.8.0
  - @milaboratories/pl-tree@1.7.11

## 1.10.11

### Patch Changes

- Updated dependencies [6bc20d1]
  - @milaboratories/pl-model-common@1.19.17

## 1.10.10

### Patch Changes

- 3d9638e: PFramesDriver run HTTP parquet server
- Updated dependencies [3d9638e]
  - @milaboratories/computable@2.6.8
  - @milaboratories/ts-helpers@1.4.7
  - @milaboratories/pl-client@2.11.13
  - @milaboratories/pl-model-common@1.19.16
  - @milaboratories/pl-tree@1.7.10

## 1.10.9

### Patch Changes

- @milaboratories/pl-model-common@1.19.15
- @milaboratories/computable@2.6.7
- @milaboratories/pl-tree@1.7.9

## 1.10.8

### Patch Changes

- Updated dependencies [b2e7c82]
  - @milaboratories/helpers@1.7.0

## 1.10.7

### Patch Changes

- Updated dependencies [2a21be5]
  - @milaboratories/pl-model-common@1.19.14

## 1.10.6

### Patch Changes

- Updated dependencies [10a5439]
  - @milaboratories/ts-helpers@1.4.6
  - @milaboratories/computable@2.6.6
  - @milaboratories/pl-client@2.11.12
  - @milaboratories/pl-tree@1.7.8

## 1.10.5

### Patch Changes

- 7cba53f: package doesn't build with npm

## 1.10.4

### Patch Changes

- 61d381c: Switch from deprecated RunCommand/\*:1 to :2

## 1.10.3

### Patch Changes

- 770cb8d: use js impl crc32

## 1.10.2

### Patch Changes

- c792469: Set type to module
- Updated dependencies [c792469]
  - @milaboratories/pl-model-common@1.19.13
  - @milaboratories/helpers@1.6.22

## 1.10.1

### Patch Changes

- b14b2fb: update dist builder
- 922f14b: Add support range options for getLocalFileContent
- Updated dependencies [b14b2fb]
  - @milaboratories/pl-model-common@1.19.11
  - @milaboratories/computable@2.6.5
  - @milaboratories/pl-client@2.11.10
  - @milaboratories/pl-tree@1.7.7
  - @milaboratories/ts-helpers@1.4.5
  - @milaboratories/helpers@1.6.21

## 1.10.0

### Minor Changes

- 521f7be: send checksum to upload if backend is allowed

## 1.9.1

### Patch Changes

- 3f93434: Packages configuration normalization
- Updated dependencies [3f93434]
  - @milaboratories/computable@2.6.4
  - @milaboratories/ts-helpers@1.4.4
  - @milaboratories/pl-client@2.11.9
  - @milaboratories/pl-model-common@1.19.8
  - @milaboratories/pl-tree@1.7.6
  - @milaboratories/helpers@1.6.20

## 1.9.0

### Minor Changes

- 4306ff2: Fix file corruption issue in upload client by preventing connection reuse
  - **CRITICAL**: Add `reset: true` to prevent connection reuse and fix data corruption where HTTP/1.1 protocol lines were being included in uploaded file content with backend's built-in S3 implementation
  - Validate existing Content-Length header values match expected chunk size
  - Add assertion to verify read chunk size matches expected content length

### Patch Changes

- 4306ff2: Network libraries upgrade: Undici, gRPC ann S3 libraries upgraded to the latest versions
- Updated dependencies [4306ff2]
  - @milaboratories/pl-client@2.11.7

## 1.8.3

### Patch Changes

- Updated dependencies [b8105fb]
  - @milaboratories/pl-model-common@1.19.4

## 1.8.2

### Patch Changes

- Updated dependencies [6d6c4ba]
  - @milaboratories/pl-model-common@1.19.3

## 1.8.1

### Patch Changes

- Updated dependencies [017a888]
  - @milaboratories/pl-model-common@1.19.2

## 1.8.0

### Minor Changes

- ff4a709: **BREAKING**: Refactor download methods to lambda-based pattern for better resource management
  - `RemoteFileDownloader.download()` → `withContent<T>()`
  - `ClientDownload.downloadBlob()` → `withBlobContent<T>()`
  - `ClientDownload.readLocalFile()` → `withLocalFileContent<T>()`
  - Replace `fromBytes`/`toBytes` params with unified `RangeBytes` interface
  - Automatic stream cleanup on all error paths including handler errors
  - Centralized error handling prevents resource leaks

### Patch Changes

- Updated dependencies [ff4a709]
  - @milaboratories/ts-helpers@1.4.3
  - @milaboratories/computable@2.6.3
  - @milaboratories/pl-client@2.11.6
  - @milaboratories/pl-tree@1.7.5

## 1.7.1

### Patch Changes

- Updated dependencies [636088d]
- Updated dependencies [636088d]
  - @milaboratories/pl-model-common@1.19.1

## 1.7.0

### Minor Changes

- 98b0ded: drivers: frontend: replace path with url with custom protocol and signature

### Patch Changes

- 98b0ded: pl-drivers: refactoring: move url driver to a separate dir
- Updated dependencies [98b0ded]
  - @milaboratories/pl-model-common@1.19.0

## 1.6.13

### Patch Changes

- Updated dependencies [3271446]
  - @milaboratories/pl-model-common@1.18.0

## 1.6.12

### Patch Changes

- Updated dependencies [188ee1e]
  - @milaboratories/ts-helpers@1.4.2
  - @milaboratories/computable@2.6.2
  - @milaboratories/pl-client@2.11.5
  - @milaboratories/pl-tree@1.7.4

## 1.6.11

### Patch Changes

- Updated dependencies [07b833e]
  - @milaboratories/computable@2.6.1
  - @milaboratories/pl-tree@1.7.3

## 1.6.10

### Patch Changes

- Updated dependencies [c29b40f]
  - @milaboratories/helpers@1.6.19
  - @milaboratories/pl-model-common@1.17.0
  - @milaboratories/computable@2.6.0
  - @milaboratories/pl-client@2.11.4
  - @milaboratories/pl-tree@1.7.2
  - @milaboratories/ts-helpers@1.4.1

## 1.6.9

### Patch Changes

- Updated dependencies [e7c0edb]
  - @milaboratories/pl-model-common@1.17.0

## 1.6.8

### Patch Changes

- Updated dependencies [9bb26ff]
  - @milaboratories/pl-model-common@1.16.5

## 1.6.7

### Patch Changes

- Updated dependencies [5e69d64]
  - @milaboratories/helpers@1.6.18

## 1.6.6

### Patch Changes

- Updated dependencies [c12345a]
  - @milaboratories/pl-model-common@1.16.4

## 1.6.5

### Patch Changes

- 54e22c2: update protofiles twice
- Updated dependencies [54e22c2]
  - @milaboratories/pl-client@2.11.4
  - @milaboratories/pl-tree@1.7.2

## 1.6.4

### Patch Changes

- 4666cae: pl-client and pl-drivers: update proto
- Updated dependencies [4666cae]
  - @milaboratories/pl-client@2.11.3
  - @milaboratories/pl-tree@1.7.1

## 1.6.3

### Patch Changes

- Updated dependencies [7be8a2b]
  - @milaboratories/pl-model-common@1.16.3

## 1.6.2

### Patch Changes

- Updated dependencies [dfb0086]
  - @milaboratories/pl-model-common@1.16.2

## 1.6.1

### Patch Changes

- Updated dependencies [d525c60]
  - @milaboratories/pl-model-common@1.16.1

## 1.6.0

### Minor Changes

- 3b46d33: - Reporting of change marker in computables provided by this module

### Patch Changes

- Updated dependencies [3b46d33]
- Updated dependencies [3b46d33]
- Updated dependencies [3b46d33]
  - @milaboratories/pl-tree@1.7.0
  - @milaboratories/pl-model-common@1.16.0
  - @milaboratories/computable@2.6.0

## 1.5.79

### Patch Changes

- Updated dependencies [bd788f9]
  - @milaboratories/pl-model-common@1.15.9

## 1.5.78

### Patch Changes

- d60b0fe: Chore: fix linter errors
- Updated dependencies [d60b0fe]
  - @milaboratories/pl-tree@1.6.12

## 1.5.77

### Patch Changes

- Updated dependencies [e210414]
  - @milaboratories/helpers@1.6.17

## 1.5.76

### Patch Changes

- Updated dependencies [8236387]
- Updated dependencies [8236387]
  - @milaboratories/pl-model-common@1.15.8
  - @milaboratories/helpers@1.6.16

## 1.5.75

### Patch Changes

- 37800c5: Public tools packages
- Updated dependencies [37800c5]
  - @milaboratories/computable@2.5.1
  - @milaboratories/ts-helpers@1.4.1
  - @milaboratories/pl-client@2.11.2
  - @milaboratories/pl-model-common@1.15.7
  - @milaboratories/pl-tree@1.6.11
  - @milaboratories/helpers@1.6.15

## 1.5.74

### Patch Changes

- Updated dependencies [6ffe944]
- Updated dependencies [6ffe944]
  - @milaboratories/pl-model-common@1.15.6

## 1.5.73

### Patch Changes

- df1a454: Blob driver - fix error on deleting not downloaded file

## 1.5.72

### Patch Changes

- 295e939: Abort canceled blob downloads

## 1.5.71

### Patch Changes

- 3d34876: Fix for closed channel error. All gRPC clients are now used via GrpcClientProvider to refresh underlying transport.
- Updated dependencies [3d34876]
  - @milaboratories/pl-client@2.11.1
  - @milaboratories/pl-tree@1.6.10

## 1.5.70

### Patch Changes

- Updated dependencies [e9d02ae]
  - @milaboratories/helpers@1.6.14

## 1.5.69

### Patch Changes

- Updated dependencies [45badc9]
  - @milaboratories/helpers@1.6.13

## 1.5.68

### Patch Changes

- c243d64: - network-related dependency upgrade
- Updated dependencies [c243d64]
- Updated dependencies [babb3eb]
- Updated dependencies [c7894c2]
- Updated dependencies [babb3eb]
  - @milaboratories/pl-client@2.11.0
  - @milaboratories/computable@2.5.0
  - @milaboratories/ts-helpers@1.4.0
  - @milaboratories/pl-tree@1.6.9

## 1.5.67

### Patch Changes

- 49cf7ee: Standard Error serialization/deserialization
- Updated dependencies [49cf7ee]
  - @milaboratories/computable@2.4.12
  - @milaboratories/ts-helpers@1.3.3
  - @milaboratories/pl-client@2.10.2
  - @milaboratories/pl-model-common@1.15.5
  - @milaboratories/pl-tree@1.6.8

## 1.5.66

### Patch Changes

- Updated dependencies [61aa680]
  - @milaboratories/pl-model-common@1.15.4

## 1.5.65

### Patch Changes

- f191f2a: drivers: download: add sparse cache for ranges
- Updated dependencies [f191f2a]
  - @milaboratories/ts-helpers@1.3.2
  - @milaboratories/pl-model-common@1.15.3
  - @milaboratories/computable@2.4.11
  - @milaboratories/pl-client@2.10.1
  - @milaboratories/pl-tree@1.6.7

## 1.5.64

### Patch Changes

- Updated dependencies [f7dedbe]
  - @milaboratories/pl-client@2.10.0
  - @milaboratories/pl-tree@1.6.6

## 1.5.63

### Patch Changes

- Updated dependencies [2d5ee55]
  - @milaboratories/pl-client@2.9.3
  - @milaboratories/pl-tree@1.6.5

## 1.5.62

### Patch Changes

- Updated dependencies [73b9f26]
  - @milaboratories/computable@2.4.10
  - @milaboratories/pl-tree@1.6.4

## 1.5.61

### Patch Changes

- Updated dependencies [0f511ff]
  - @milaboratories/ts-helpers@1.3.1
  - @milaboratories/computable@2.4.9
  - @milaboratories/pl-client@2.9.2
  - @milaboratories/pl-tree@1.6.3

## 1.5.60

### Patch Changes

- Updated dependencies [1cbbd66]
  - @milaboratories/pl-model-common@1.15.2

## 1.5.59

### Patch Changes

- Updated dependencies [ce87da7]
  - @milaboratories/ts-helpers@1.3.0
  - @milaboratories/computable@2.4.8
  - @milaboratories/pl-client@2.9.1
  - @milaboratories/pl-tree@1.6.2

## 1.5.58

### Patch Changes

- 7878cb5: drivers: download: add range
- Updated dependencies [89fd5d3]
- Updated dependencies [7878cb5]
  - @milaboratories/pl-model-common@1.15.1

## 1.5.57

### Patch Changes

- Updated dependencies [b0b80af]
  - @milaboratories/pl-model-common@1.15.0

## 1.5.56

### Patch Changes

- Updated dependencies [94468e0]
  - @milaboratories/pl-model-common@1.14.1

## 1.5.55

### Patch Changes

- 6ab1be8: updated check network

## 1.5.54

### Patch Changes

- b8c7847: extract download_blob to a separate folder; jest -> vitest

## 1.5.53

### Patch Changes

- b82d4de: check network: storages check; drivers: download: range query initial

## 1.5.52

### Patch Changes

- @milaboratories/pl-tree@1.6.1

## 1.5.51

### Patch Changes

- 5277219: Deeper network check with templates for downloading and uploading files and running binaries and Python.

## 1.5.50

### Patch Changes

- Updated dependencies [01a558e]
- Updated dependencies [01a558e]
- Updated dependencies [01a558e]
- Updated dependencies [01a558e]
  - @milaboratories/pl-client@2.9.0
  - @milaboratories/pl-model-common@1.14.0
  - @milaboratories/ts-helpers@1.2.0
  - @milaboratories/pl-tree@1.6.0
  - @milaboratories/computable@2.4.7

## 1.5.49

### Patch Changes

- Updated dependencies [5240867]
  - @milaboratories/ts-helpers@1.1.7
  - @milaboratories/computable@2.4.6
  - @milaboratories/pl-client@2.8.2
  - @milaboratories/pl-tree@1.5.8

## 1.5.48

### Patch Changes

- @milaboratories/pl-model-common@1.13.8
- @milaboratories/computable@2.4.5
- @milaboratories/pl-tree@1.5.7

## 1.5.47

### Patch Changes

- Updated dependencies [56d021e]
  - @milaboratories/ts-helpers@1.1.6
  - @milaboratories/computable@2.4.4
  - @milaboratories/pl-client@2.8.1
  - @milaboratories/pl-tree@1.5.6

## 1.5.46

### Patch Changes

- Updated dependencies [f9bc9a8]
  - @milaboratories/pl-model-common@1.13.7

## 1.5.45

### Patch Changes

- Updated dependencies [621e15a]
  - @milaboratories/pl-model-common@1.13.6

## 1.5.44

### Patch Changes

- @milaboratories/pl-tree@1.5.5

## 1.5.43

### Patch Changes

- Updated dependencies [21233c2]
  - @milaboratories/pl-model-common@1.13.5

## 1.5.42

### Patch Changes

- Updated dependencies [e65a1a6]
  - @milaboratories/pl-client@2.8.0
  - @milaboratories/pl-tree@1.5.4

## 1.5.41

### Patch Changes

- Updated dependencies [43e1c65]
  - @milaboratories/pl-model-common@1.13.4

## 1.5.40

### Patch Changes

- Updated dependencies [6e3329e]
  - @milaboratories/computable@2.4.3
  - @milaboratories/pl-model-common@1.13.3
  - @milaboratories/pl-tree@1.5.3

## 1.5.39

### Patch Changes

- Updated dependencies [962c620]
  - @milaboratories/pl-model-common@1.13.2

## 1.5.38

### Patch Changes

- Updated dependencies [2fc07ba]
  - @milaboratories/pl-model-common@1.13.1

## 1.5.37

### Patch Changes

- Updated dependencies [7c52bb5]
  - @milaboratories/pl-model-common@1.13.0

## 1.5.36

### Patch Changes

- Updated dependencies [88cebeb]
  - @milaboratories/pl-model-common@1.12.0

## 1.5.35

### Patch Changes

- Updated dependencies [9e9a70f]
  - @milaboratories/computable@2.4.2
  - @milaboratories/ts-helpers@1.1.5
  - @milaboratories/pl-client@2.7.14
  - @milaboratories/pl-model-common@1.11.4
  - @milaboratories/pl-tree@1.5.2

## 1.5.34

### Patch Changes

- Updated dependencies [4812a12]
  - @milaboratories/pl-model-common@1.11.3

## 1.5.33

### Patch Changes

- Updated dependencies [5f0fb1d]
  - @milaboratories/pl-model-common@1.11.2

## 1.5.32

### Patch Changes

- a505bdb: Upgrade network and tool dependencies:
  - undici: ~7.4.0 → ~7.5.0
  - @grpc/grpc-js: ~1.12.6 → ~1.13.1
  - @protobuf-ts/plugin: 2.9.5 → 2.9.6
  - @aws-sdk/client-s3: 3.758.0 → 3.775.0
  - lru-cache: ^11.0.2 → ^11.1.0
  - yaml: ^2.6.1 → ^2.7.0
  - remeda: ^2.21.1 → ^2.21.2
  - vite-plugin-dts: ^4.4.0 → ^4.5.3
  - eslint: ^9.22.0 → ^9.23.0
  - @vitejs/plugin-vue: ^5.2.1 → ^5.2.3
- Updated dependencies [a505bdb]
  - @milaboratories/pl-client@2.7.13
  - @milaboratories/pl-model-common@1.11.1
  - @milaboratories/pl-tree@1.5.1
  - @milaboratories/computable@2.4.1
  - @milaboratories/ts-helpers@1.1.4

## 1.5.31

### Patch Changes

- Updated dependencies [dc4f10a]
  - @milaboratories/pl-tree@1.5.0

## 1.5.30

### Patch Changes

- Updated dependencies [7d2be5d]
  - @milaboratories/pl-tree@1.4.34

## 1.5.29

### Patch Changes

- Updated dependencies [b084260]
  - @milaboratories/pl-model-common@1.11.1

## 1.5.28

### Patch Changes

- Updated dependencies [2a0fb91]
- Updated dependencies [d6a49b2]
  - @milaboratories/pl-tree@1.4.33
  - @milaboratories/computable@2.4.1

## 1.5.27

### Patch Changes

- Updated dependencies [1016b99]
  - @milaboratories/pl-model-common@1.11.0

## 1.5.26

### Patch Changes

- Updated dependencies [fdd58fd]
  - @milaboratories/computable@2.4.0
  - @milaboratories/pl-tree@1.4.32

## 1.5.25

### Patch Changes

- Updated dependencies [3944280]
  - @milaboratories/pl-client@2.7.12
  - @milaboratories/pl-tree@1.4.31

## 1.5.24

### Patch Changes

- @milaboratories/pl-client@2.7.11
- @milaboratories/pl-tree@1.4.30

## 1.5.23

### Patch Changes

- @milaboratories/pl-client@2.7.10
- @milaboratories/pl-tree@1.4.29

## 1.5.22

### Patch Changes

- Updated dependencies [2c75b72]
  - @milaboratories/pl-client@2.7.9
  - @milaboratories/pl-tree@1.4.28

## 1.5.21

### Patch Changes

- Updated dependencies [1628eec]
  - @milaboratories/pl-client@2.7.8
  - @milaboratories/pl-tree@1.4.27

## 1.5.20

### Patch Changes

- e06efcd: Pin and standardize dependency versions for network and utility libraries to ensure consistent builds and prevent unexpected behavior from minor version changes. Changes include:

  - Pin `@protobuf-ts/*` packages to version 2.9.4 using YAML anchors
  - Pin AWS SDK packages to version 3.750.0
  - Change `undici` from `^7.2.3` to `~7.2.3` (only patch updates)
  - Change `@grpc/grpc-js` from `^1.12.6` to `~1.12.6` (only patch updates)
  - Change `cacheable-lookup` from `^6.1.0` to `~6.1.0` (only patch updates)
  - Change `canonicalize` from `^2.0.0` to `~2.0.0` (only patch updates)
  - Pin `quickjs-emscripten` to exact version 0.31.0

- Updated dependencies [e06efcd]
  - @milaboratories/pl-client@2.7.7
  - @milaboratories/pl-tree@1.4.26

## 1.5.19

### Patch Changes

- Updated dependencies [d1f4acf]
  - @milaboratories/pl-client@2.7.6
  - @milaboratories/pl-tree@1.4.25

## 1.5.18

### Patch Changes

- 819c13c: getComputableContent method for DownloadDriver
- Updated dependencies [819c13c]
  - @milaboratories/pl-model-common@1.10.6

## 1.5.17

### Patch Changes

- a77b40a: add `any` everywhere, ssh: persistent connection; upload: dynamic part chooser
- Updated dependencies [a77b40a]
  - @milaboratories/ts-helpers@1.1.4
  - @milaboratories/computable@2.3.5
  - @milaboratories/pl-client@2.7.5
  - @milaboratories/pl-tree@1.4.24

## 1.5.16

### Patch Changes

- 19c273b: SDK Eslint config

## 1.5.15

### Patch Changes

- 6a50f96: keepalive, more logs

## 1.5.14

### Patch Changes

- @milaboratories/pl-client@2.7.4
- @milaboratories/pl-tree@1.4.23

## 1.5.13

### Patch Changes

- 388c9d2: add getProgressLogWithInfo to log driver
- Updated dependencies [388c9d2]
  - @milaboratories/pl-model-common@1.10.5

## 1.5.12

### Patch Changes

- 3c474bd: drivers: fix unzipping nested dirs in blob_to_url driver

## 1.5.11

### Patch Changes

- ce558f9: add blob to url driver that decompress the folder and returns url to the blob
- b41709a: new driver: blob to url that unarchive things
- Updated dependencies [ce558f9]
- Updated dependencies [b41709a]
  - @milaboratories/pl-model-common@1.10.4

## 1.5.10

### Patch Changes

- Updated dependencies [32c7f91]
  - @milaboratories/pl-client@2.7.3
  - @milaboratories/pl-tree@1.4.22

## 1.5.9

### Patch Changes

- Updated dependencies [a9b0749]
  - @milaboratories/pl-client@2.7.2
  - @milaboratories/pl-tree@1.4.21

## 1.5.8

### Patch Changes

- Updated dependencies [32966e6]
  - @milaboratories/pl-model-common@1.10.3

## 1.5.7

### Patch Changes

- ddb29cf: upload: done progress if a blob already existed

## 1.5.6

### Patch Changes

- Updated dependencies [079f50e]
  - @milaboratories/pl-model-common@1.10.2

## 1.5.5

### Patch Changes

- 95d7801: drivers: download: fix JSON.strinfigy in logs; don't call S3 just because of size; enable tests

## 1.5.4

### Patch Changes

- 8903a30: Dependency upgrade
- Updated dependencies [8903a30]
  - @milaboratories/pl-model-common@1.10.1
  - @milaboratories/pl-client@2.7.1
  - @milaboratories/pl-tree@1.4.20

## 1.5.3

### Patch Changes

- Updated dependencies [4d9885b]
  - @milaboratories/pl-model-common@1.10.0

## 1.5.2

### Patch Changes

- Updated dependencies [6efea3d]
  - @milaboratories/pl-model-common@1.9.0

## 1.5.1

### Patch Changes

- Updated dependencies [02feb1a]
  - @milaboratories/pl-model-common@1.8.1

## 1.5.0

### Minor Changes

- dac7e27: undici and grpc libraries upgrade

### Patch Changes

- Updated dependencies [81a1ad7]
- Updated dependencies [dac7e27]
- Updated dependencies [dac7e27]
  - @milaboratories/pl-client@2.7.0
  - @milaboratories/ts-helpers@1.1.3
  - @milaboratories/pl-tree@1.4.19
  - @milaboratories/computable@2.3.4

## 1.4.0

### Minor Changes

- f5b996c: huge refactoring, several bugs fixed, see https://www.notion.so/mixcr/drivers-Upload-stability-issue-multiple-issues-in-this-ticket-1423a83ff4af8099a6c1e3b46f2c269e?pvs=4

### Patch Changes

- 3dd3a5c: add test blocks
- Updated dependencies [3dd3a5c]
  - @milaboratories/ts-helpers@1.1.2
  - @milaboratories/computable@2.3.3
  - @milaboratories/pl-client@2.6.3
  - @milaboratories/pl-tree@1.4.18

## 1.3.26

### Patch Changes

- Updated dependencies [80d74a1]
  - @milaboratories/pl-client@2.6.2
  - @milaboratories/pl-tree@1.4.17

## 1.3.25

### Patch Changes

- Updated dependencies [dfad2d0]
  - @milaboratories/pl-model-common@1.8.0

## 1.3.24

### Patch Changes

- Updated dependencies [a5100ac]
  - @milaboratories/pl-model-common@1.7.0

## 1.3.23

### Patch Changes

- Updated dependencies [c1ea333]
  - @milaboratories/computable@2.3.2
  - @milaboratories/pl-tree@1.4.16

## 1.3.22

### Patch Changes

- Updated dependencies [e0f0eed]
  - @milaboratories/pl-model-common@1.6.4

## 1.3.21

### Patch Changes

- Updated dependencies [6f56890]
  - @milaboratories/pl-model-common@1.6.3

## 1.3.20

### Patch Changes

- Updated dependencies [b207f86]
  - @milaboratories/pl-client@2.6.1
  - @milaboratories/pl-tree@1.4.15

## 1.3.19

### Patch Changes

- Updated dependencies [5113fe4]
- Updated dependencies [5113fe4]
  - @milaboratories/pl-client@2.6.0
  - @milaboratories/pl-tree@1.4.14

## 1.3.18

### Patch Changes

- Updated dependencies [e70d0db]
  - @milaboratories/computable@2.3.1
  - @milaboratories/pl-tree@1.4.13

## 1.3.17

### Patch Changes

- b04a78a: Minor stability marker fixes, upload stability problem isolated.
- Updated dependencies [b04a78a]
- Updated dependencies [b04a78a]
  - @milaboratories/computable@2.3.0
  - @milaboratories/pl-model-common@1.6.2
  - @milaboratories/pl-tree@1.4.12

## 1.3.16

### Patch Changes

- 0382abe: Undici & AWS SDK upgrades.
- Updated dependencies [0382abe]
  - @milaboratories/pl-client@2.5.10
  - @milaboratories/pl-tree@1.4.11

## 1.3.15

### Patch Changes

- Updated dependencies [a5af4f2]
  - @milaboratories/pl-model-common@1.6.1

## 1.3.14

### Patch Changes

- Updated dependencies [05751fa]
  - @milaboratories/pl-model-common@1.6.0

## 1.3.13

### Patch Changes

- Updated dependencies [83b50e0]
  - @milaboratories/pl-client@2.5.9
  - @milaboratories/pl-tree@1.4.10

## 1.3.12

### Patch Changes

- 5a4d01b: drivers, upload: return an immutable object to API, bump pl with fixing getStatus error

## 1.3.11

### Patch Changes

- Updated dependencies [0573960]
  - @milaboratories/pl-client@2.5.8
  - @milaboratories/pl-tree@1.4.9

## 1.3.10

### Patch Changes

- Updated dependencies [75b1646]
  - @milaboratories/ts-helpers@1.1.1
  - @milaboratories/computable@2.2.1
  - @milaboratories/pl-client@2.5.7
  - @milaboratories/pl-tree@1.4.8

## 1.3.9

### Patch Changes

- Updated dependencies [50f7459]
  - @milaboratories/pl-client@2.5.6
  - @milaboratories/pl-tree@1.4.7

## 1.3.8

### Patch Changes

- 58fa87c: fix no progress in mixcr clonotyping logs

## 1.3.7

### Patch Changes

- Updated dependencies [612a9be]
  - @milaboratories/pl-model-common@1.5.2

## 1.3.6

### Patch Changes

- 8e0ef1f: ls: if wmic is not found, fall back to just drive C
- Updated dependencies [8e9424a]
  - @milaboratories/pl-model-common@1.5.1

## 1.3.5

### Patch Changes

- Updated dependencies [1d5f1e2]
- Updated dependencies [1d5f1e2]
  - @milaboratories/pl-client@2.5.5
  - @milaboratories/pl-tree@1.4.6

## 1.3.4

### Patch Changes

- 9dae9aa: migration to new LS SDK model
- Updated dependencies [9dae9aa]
  - @milaboratories/pl-model-common@1.5.0

## 1.3.3

### Patch Changes

- 4598cac: drivers: ls: more storages for Windows

## 1.3.2

### Patch Changes

- Updated dependencies [28429fa]
  - @milaboratories/pl-client@2.5.4
  - @milaboratories/pl-tree@1.4.5

## 1.3.1

### Patch Changes

- 1e57f5b: decode urls for downloading (it was broken on Windows)

## 1.3.0

### Minor Changes

- 352e182: refactoring of ls controller and driver options

### Patch Changes

- Updated dependencies [66383b6]
- Updated dependencies [66383b6]
- Updated dependencies [66383b6]
  - @milaboratories/computable@2.2.0
  - @milaboratories/pl-client@2.5.3
  - @milaboratories/pl-model-common@1.4.0
  - @milaboratories/pl-tree@1.4.4

## 1.2.35

### Patch Changes

- Updated dependencies [eb079e9]
  - @milaboratories/pl-model-common@1.3.15

## 1.2.34

### Patch Changes

- Updated dependencies [11d30ad]
  - @milaboratories/pl-client@2.5.2
  - @milaboratories/pl-tree@1.4.3

## 1.2.33

### Patch Changes

- Updated dependencies [9e6e912]
  - @milaboratories/ts-helpers@1.1.0
  - @milaboratories/computable@2.1.13
  - @milaboratories/pl-client@2.5.1
  - @milaboratories/pl-tree@1.4.2

## 1.2.32

### Patch Changes

- Updated dependencies [dd26f39]
  - @milaboratories/pl-client@2.5.0
  - @milaboratories/pl-tree@1.4.1

## 1.2.31

### Patch Changes

- Updated dependencies [a5562e9]
- Updated dependencies [a5562e9]
  - @milaboratories/pl-tree@1.4.0
  - @milaboratories/pl-client@2.4.21

## 1.2.30

### Patch Changes

- Updated dependencies [13013ee]
- Updated dependencies [36736de]
  - @milaboratories/pl-model-common@1.3.14
  - @milaboratories/pl-client@2.4.20
  - @milaboratories/pl-tree@1.3.19

## 1.2.29

### Patch Changes

- Updated dependencies [7a04201]
- Updated dependencies [89cf026]
- Updated dependencies [7a04201]
  - @milaboratories/ts-helpers@1.0.30
  - @milaboratories/computable@2.1.12
  - @milaboratories/pl-tree@1.3.18
  - @milaboratories/pl-client@2.4.19

## 1.2.28

### Patch Changes

- 1e10161: new pl-local package that launches platforma
- Updated dependencies [1e10161]
- Updated dependencies [d5ef69e]
  - @milaboratories/ts-helpers@1.0.29
  - @milaboratories/computable@2.1.11
  - @milaboratories/pl-client@2.4.18
  - @milaboratories/pl-tree@1.3.17

## 1.2.27

### Patch Changes

- Updated dependencies [bfd40b4]
  - @milaboratories/computable@2.1.10
  - @milaboratories/pl-tree@1.3.16

## 1.2.26

### Patch Changes

- Updated dependencies [86c8d0f]
  - @milaboratories/computable@2.1.9
  - @milaboratories/pl-tree@1.3.15

## 1.2.25

### Patch Changes

- Updated dependencies [e65f21d]
- Updated dependencies [e65f21d]
  - @milaboratories/ts-helpers@1.0.28
  - @milaboratories/computable@2.1.8
  - @milaboratories/pl-client@2.4.17
  - @milaboratories/pl-tree@1.3.14

## 1.2.24

### Patch Changes

- 4bb85dc: read bodies in case of errors, body.destroy is too scary

## 1.2.23

### Patch Changes

- 60dc4db: undici: close all bodies, because they can hold resources
- 864a686: clear lastError from API when the loading is done
- Updated dependencies [1d1ff16]
  - @milaboratories/pl-client@2.4.16
  - @milaboratories/pl-tree@1.3.13

## 1.2.22

### Patch Changes

- Updated dependencies [fa6d0f2]
  - @milaboratories/ts-helpers@1.0.27
  - @milaboratories/pl-tree@1.3.12
  - @milaboratories/computable@2.1.7
  - @milaboratories/pl-client@2.4.15

## 1.2.21

### Patch Changes

- Updated dependencies [fcbc2df]
  - @milaboratories/ts-helpers@1.0.26
  - @milaboratories/pl-tree@1.3.11
  - @milaboratories/computable@2.1.6
  - @milaboratories/pl-client@2.4.14

## 1.2.20

### Patch Changes

- Updated dependencies [6d4cf3e]
  - @milaboratories/pl-model-common@1.3.13

## 1.2.19

### Patch Changes

- da1e029: add isolatedModules true to the root tsonfig
- Updated dependencies [da1e029]
  - @milaboratories/pl-model-common@1.3.12
  - @milaboratories/computable@2.1.5
  - @milaboratories/pl-client@2.4.13
  - @milaboratories/pl-tree@1.3.10
  - @milaboratories/ts-helpers@1.0.25

## 1.2.18

### Patch Changes

- Updated dependencies [1a71473]
  - @milaboratories/pl-tree@1.3.9

## 1.2.17

### Patch Changes

- 0f3f25f: fallback "types", "main" and "module" in package.json
- Updated dependencies [0f3f25f]
  - @milaboratories/computable@2.1.4
  - @milaboratories/ts-helpers@1.0.24
  - @milaboratories/pl-client@2.4.12
  - @milaboratories/pl-model-common@1.3.11
  - @milaboratories/pl-tree@1.3.8

## 1.2.16

### Patch Changes

- 244e3dc: Migration to vite-based build & downgrading lib packages to commonjs package.json type
- Updated dependencies [244e3dc]
  - @milaboratories/computable@2.1.3
  - @milaboratories/ts-helpers@1.0.23
  - @milaboratories/pl-client@2.4.11
  - @milaboratories/pl-model-common@1.3.10
  - @milaboratories/pl-tree@1.3.7
