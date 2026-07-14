# @platforma-sdk/pl-cli

## 0.8.3

### Patch Changes

- @milaboratories/pl-middle-layer@1.66.1

## 0.8.2

### Patch Changes

- Updated dependencies [881d6ba]
  - @milaboratories/pl-middle-layer@1.66.0
  - @milaboratories/pl-client@3.14.1

## 0.8.1

### Patch Changes

- @milaboratories/pl-middle-layer@1.65.9

## 0.8.0

### Minor Changes

- dbe7fdb: Add `pl-cli admin user-list`: lists all known users' logins from a live server (admin-authenticated), CSV by default (`--format text|json` also supported). Adds `PlClient.listUsers()`.

### Patch Changes

- Updated dependencies [dbe7fdb]
  - @milaboratories/pl-client@3.14.0
  - @milaboratories/pl-middle-layer@1.65.8

## 0.7.84

### Patch Changes

- @milaboratories/pl-middle-layer@1.65.7

## 0.7.83

### Patch Changes

- @milaboratories/pl-middle-layer@1.65.6

## 0.7.82

### Patch Changes

- @milaboratories/pl-middle-layer@1.65.5

## 0.7.81

### Patch Changes

- @milaboratories/pl-middle-layer@1.65.4

## 0.7.80

### Patch Changes

- Updated dependencies [d1c4453]
  - @milaboratories/pl-middle-layer@1.65.3

## 0.7.79

### Patch Changes

- @milaboratories/pl-middle-layer@1.65.2
- @milaboratories/pl-client@3.13.2

## 0.7.78

### Patch Changes

- Updated dependencies [effca5f]
  - @milaboratories/pl-client@3.13.1
  - @milaboratories/pl-middle-layer@1.65.1

## 0.7.77

### Patch Changes

- Updated dependencies [ffa04e7]
  - @milaboratories/pl-client@3.13.0
  - @milaboratories/pl-middle-layer@1.65.0

## 0.7.76

### Patch Changes

- Updated dependencies [d3c82d9]
- Updated dependencies [3df748f]
  - @milaboratories/pl-middle-layer@1.64.42
  - @milaboratories/pl-client@3.12.1

## 0.7.75

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.41

## 0.7.74

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.40

## 0.7.73

### Patch Changes

- Updated dependencies [528f66d]
  - @milaboratories/pl-client@3.12.0
  - @milaboratories/pl-middle-layer@1.64.39

## 0.7.72

### Patch Changes

- Updated dependencies [534a237]
  - @milaboratories/pl-middle-layer@1.64.38
  - @milaboratories/pl-client@3.11.5

## 0.7.71

### Patch Changes

- 663af8d: Migrate the pl-cli (`pl-cli`) CLI framework from oclif to commander. CLI-only,
  internal change — the full command surface (`project list|info|duplicate|rename|delete`,
  `admin copy-project`), all flags (`-a/--address`, `-f/--format`, `-u/--user`,
  `-p/--password`, `--admin-user`, `--admin-password`, `--target-user`,
  `-n/--name`, `--auto-rename`/`--no-auto-rename`, `--force`, `--source-user`,
  `--source-project`), their env-var bindings, required/choice constraints, and the
  `project` ID positional argument are preserved. The oclif base-command class
  becomes plain `connect()`/`connectClient()` helpers; the library exports
  (`src/lib.ts`) are unchanged. Drops `@oclif/core`, `@milaboratories/oclif-index`,
  and the generated command index.
  - @milaboratories/pl-middle-layer@1.64.37

## 0.7.70

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.36

## 0.7.69

### Patch Changes

- Updated dependencies [c73159f]
- Updated dependencies [3a4036d]
  - @milaboratories/pl-middle-layer@1.64.35

## 0.7.68

### Patch Changes

- Updated dependencies [f54a040]
  - @milaboratories/pl-middle-layer@1.64.34

## 0.7.67

### Patch Changes

- @milaboratories/pl-client@3.11.5
- @milaboratories/pl-middle-layer@1.64.33

## 0.7.66

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.32

## 0.7.65

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.31

## 0.7.64

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.30

## 0.7.63

### Patch Changes

- Updated dependencies [ae79571]
- Updated dependencies [2019cf9]
  - @milaboratories/pl-middle-layer@1.64.29

## 0.7.62

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.28

## 0.7.61

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.27

## 0.7.60

### Patch Changes

- @milaboratories/pl-client@3.11.4
- @milaboratories/pl-middle-layer@1.64.26

## 0.7.59

### Patch Changes

- @milaboratories/pl-client@3.11.4
- @milaboratories/pl-middle-layer@1.64.25

## 0.7.58

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.24

## 0.7.57

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.23

## 0.7.56

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.22

## 0.7.55

### Patch Changes

- Updated dependencies [48f8210]
  - @milaboratories/pl-middle-layer@1.64.21

## 0.7.54

### Patch Changes

- @milaboratories/pl-client@3.11.4
- @milaboratories/pl-middle-layer@1.64.20

## 0.7.53

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.19

## 0.7.52

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.18

## 0.7.51

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.17

## 0.7.50

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.16

## 0.7.49

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.15

## 0.7.48

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.14

## 0.7.47

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.13

## 0.7.46

### Patch Changes

- @milaboratories/pl-client@3.11.3
- @milaboratories/pl-middle-layer@1.64.12

## 0.7.45

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.11

## 0.7.44

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.10

## 0.7.43

### Patch Changes

- @milaboratories/pl-client@3.11.2
- @milaboratories/pl-middle-layer@1.64.9

## 0.7.42

### Patch Changes

- Updated dependencies [c9dccff]
  - @milaboratories/pl-middle-layer@1.64.8

## 0.7.41

### Patch Changes

- Updated dependencies [eb52193]
  - @milaboratories/pl-middle-layer@1.64.7

## 0.7.40

### Patch Changes

- @milaboratories/pl-client@3.11.1
- @milaboratories/pl-middle-layer@1.64.6

## 0.7.39

### Patch Changes

- Updated dependencies [e61785b]
  - @milaboratories/pl-client@3.11.0
  - @milaboratories/pl-middle-layer@1.64.5

## 0.7.38

### Patch Changes

- @milaboratories/pl-client@3.10.2
- @milaboratories/pl-middle-layer@1.64.4

## 0.7.37

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.3

## 0.7.36

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.2

## 0.7.35

### Patch Changes

- @milaboratories/pl-middle-layer@1.64.1

## 0.7.34

### Patch Changes

- Updated dependencies [e4c4c21]
  - @milaboratories/pl-middle-layer@1.64.0

## 0.7.33

### Patch Changes

- @milaboratories/pl-middle-layer@1.63.2

## 0.7.32

### Patch Changes

- @milaboratories/pl-middle-layer@1.63.1

## 0.7.31

### Patch Changes

- Updated dependencies [98092a6]
  - @milaboratories/pl-middle-layer@1.63.0
  - @milaboratories/pl-client@3.10.1

## 0.7.30

### Patch Changes

- Updated dependencies [0a3af02]
  - @milaboratories/pl-client@3.10.0
  - @milaboratories/pl-middle-layer@1.62.0

## 0.7.29

### Patch Changes

- @milaboratories/pl-middle-layer@1.61.12

## 0.7.28

### Patch Changes

- @milaboratories/pl-middle-layer@1.61.11

## 0.7.27

### Patch Changes

- @milaboratories/pl-middle-layer@1.61.10

## 0.7.26

### Patch Changes

- Updated dependencies [0c317f5]
  - @milaboratories/pl-client@3.9.2
  - @milaboratories/pl-middle-layer@1.61.9

## 0.7.25

### Patch Changes

- Updated dependencies [a0a909c]
  - @milaboratories/pl-client@3.9.1
  - @milaboratories/pl-middle-layer@1.61.8

## 0.7.24

### Patch Changes

- @milaboratories/pl-middle-layer@1.61.7

## 0.7.23

### Patch Changes

- @milaboratories/pl-middle-layer@1.61.6

## 0.7.22

### Patch Changes

- @milaboratories/pl-middle-layer@1.61.5

## 0.7.21

### Patch Changes

- Updated dependencies [0ce161f]
  - @milaboratories/pl-client@3.9.0
  - @milaboratories/pl-middle-layer@1.61.4

## 0.7.20

### Patch Changes

- Updated dependencies [af6f1c0]
  - @milaboratories/pl-client@3.8.1
  - @milaboratories/pl-middle-layer@1.61.3

## 0.7.19

### Patch Changes

- @milaboratories/pl-middle-layer@1.61.2

## 0.7.18

### Patch Changes

- Updated dependencies [c097727]
  - @milaboratories/pl-client@3.8.0
  - @milaboratories/pl-middle-layer@1.61.1

## 0.7.17

### Patch Changes

- Updated dependencies [030e8c2]
  - @milaboratories/pl-client@3.7.0
  - @milaboratories/pl-middle-layer@1.61.0

## 0.7.16

### Patch Changes

- Updated dependencies [2d719ea]
  - @milaboratories/pl-middle-layer@1.60.5

## 0.7.15

### Patch Changes

- Updated dependencies [6066082]
  - @milaboratories/pl-client@3.6.0
  - @milaboratories/pl-middle-layer@1.60.4

## 0.7.14

### Patch Changes

- @milaboratories/pl-middle-layer@1.60.3

## 0.7.13

### Patch Changes

- Updated dependencies [f302c2f]
  - @milaboratories/pl-middle-layer@1.60.2

## 0.7.12

### Patch Changes

- @milaboratories/pl-middle-layer@1.60.1

## 0.7.11

### Patch Changes

- Updated dependencies [b1ea44e]
  - @milaboratories/pl-middle-layer@1.60.0
  - @milaboratories/pl-client@3.5.0

## 0.7.10

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.15

## 0.7.9

### Patch Changes

- @milaboratories/pl-client@3.4.2
- @milaboratories/pl-middle-layer@1.59.14

## 0.7.8

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.13

## 0.7.7

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.12

## 0.7.6

### Patch Changes

- Updated dependencies [d93d296]
  - @milaboratories/pl-middle-layer@1.59.11

## 0.7.5

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.10

## 0.7.4

### Patch Changes

- Updated dependencies [bcf1107]
  - @milaboratories/pl-client@3.4.1
  - @milaboratories/pl-middle-layer@1.59.9

## 0.7.3

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.8

## 0.7.2

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.7

## 0.7.1

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.6

## 0.7.0

### Minor Changes

- e65c3b9: Support fresh contract of user root creation

### Patch Changes

- Updated dependencies [e65c3b9]
  - @milaboratories/pl-client@3.4.0
  - @milaboratories/pl-middle-layer@1.59.5

## 0.6.4

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.4

## 0.6.3

### Patch Changes

- @milaboratories/pl-client@3.3.3
- @milaboratories/pl-middle-layer@1.59.3

## 0.6.2

### Patch Changes

- @milaboratories/pl-middle-layer@1.59.2
- @milaboratories/pl-client@3.3.2

## 0.6.1

### Patch Changes

- @milaboratories/pl-client@3.3.1
- @milaboratories/pl-middle-layer@1.59.1

## 0.6.0

### Minor Changes

- 72a9e61: Support signatures tracking and strict security mode of backend

### Patch Changes

- Updated dependencies [72a9e61]
  - @milaboratories/pl-middle-layer@1.59.0
  - @milaboratories/pl-client@3.3.0

## 0.5.6

### Patch Changes

- @milaboratories/pl-middle-layer@1.58.4

## 0.5.5

### Patch Changes

- @milaboratories/pl-middle-layer@1.58.3

## 0.5.4

### Patch Changes

- Updated dependencies [16fb5a6]
  - @milaboratories/pl-middle-layer@1.58.2

## 0.5.3

### Patch Changes

- @milaboratories/pl-middle-layer@1.58.1

## 0.5.2

### Patch Changes

- Updated dependencies [731ab44]
  - @milaboratories/pl-middle-layer@1.58.0
  - @milaboratories/pl-client@3.2.5

## 0.5.1

### Patch Changes

- @milaboratories/pl-middle-layer@1.57.1

## 0.5.0

### Minor Changes

- 6369956: Show table with partial data

### Patch Changes

- Updated dependencies [6369956]
  - @milaboratories/pl-middle-layer@1.57.0
  - @milaboratories/pl-client@3.2.4

## 0.4.2

### Patch Changes

- Updated dependencies [a40505e]
  - @milaboratories/pl-middle-layer@1.56.2
  - @milaboratories/pl-client@3.2.3

## 0.4.1

### Patch Changes

- @milaboratories/pl-middle-layer@1.56.1

## 0.4.0

### Minor Changes

- d8f985a: Correct show label columns and simplify join for big projects

### Patch Changes

- Updated dependencies [d8f985a]
  - @milaboratories/pl-middle-layer@1.56.0

## 0.3.5

### Patch Changes

- f28bb32: rename run.js to mjs to fix bunch of warnings in dev mode
  - @milaboratories/pl-middle-layer@1.55.29
  - @milaboratories/pl-client@3.2.2

## 0.3.4

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.28

## 0.3.3

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.27

## 0.3.2

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.26

## 0.3.1

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.25
- @milaboratories/pl-client@3.2.1

## 0.3.0

### Minor Changes

- 58a28bc: Use PlClient.getUserRoot() to get user's root on modern backends

### Patch Changes

- Updated dependencies [58a28bc]
  - @milaboratories/pl-client@3.2.0
  - @milaboratories/pl-middle-layer@1.55.24

## 0.2.41

### Patch Changes

- Updated dependencies [425b6b3]
  - @milaboratories/pl-middle-layer@1.55.23

## 0.2.40

### Patch Changes

- @milaboratories/pl-client@3.1.8
- @milaboratories/pl-middle-layer@1.55.22

## 0.2.39

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.21
- @milaboratories/pl-client@3.1.7

## 0.2.38

### Patch Changes

- @milaboratories/pl-client@3.1.6
- @milaboratories/pl-middle-layer@1.55.20

## 0.2.37

### Patch Changes

- @milaboratories/pl-client@3.1.5
- @milaboratories/pl-middle-layer@1.55.19

## 0.2.36

### Patch Changes

- Updated dependencies [1411dea]
  - @milaboratories/pl-middle-layer@1.55.18
  - @milaboratories/pl-client@3.1.4

## 0.2.35

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.17
- @milaboratories/pl-client@3.1.3

## 0.2.34

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.16

## 0.2.33

### Patch Changes

- @milaboratories/pl-client@3.1.2
- @milaboratories/pl-middle-layer@1.55.15

## 0.2.32

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.14

## 0.2.31

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.13

## 0.2.30

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.12

## 0.2.29

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.11

## 0.2.28

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.10

## 0.2.27

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.9

## 0.2.26

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.8

## 0.2.25

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.7

## 0.2.24

### Patch Changes

- @milaboratories/pl-client@3.1.1
- @milaboratories/pl-middle-layer@1.55.6

## 0.2.23

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.5

## 0.2.22

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.4

## 0.2.21

### Patch Changes

- Updated dependencies [96b0516]
  - @milaboratories/pl-client@3.1.0
  - @milaboratories/pl-middle-layer@1.55.3

## 0.2.20

### Patch Changes

- @milaboratories/pl-client@3.0.0
- @milaboratories/pl-middle-layer@1.55.2

## 0.2.19

### Patch Changes

- @milaboratories/pl-middle-layer@1.55.1

## 0.2.18

### Patch Changes

- Updated dependencies [904ebd9]
  - @milaboratories/pl-middle-layer@1.55.0

## 0.2.17

### Patch Changes

- @milaboratories/pl-middle-layer@1.54.7

## 0.2.16

### Patch Changes

- Updated dependencies [de415f7]
  - @milaboratories/pl-client@3.0.0
  - @milaboratories/pl-middle-layer@1.54.6

## 0.2.15

### Patch Changes

- Updated dependencies [f1089db]
  - @milaboratories/pl-middle-layer@1.54.5

## 0.2.14

### Patch Changes

- Updated dependencies [9f5e086]
  - @milaboratories/pl-middle-layer@1.54.4

## 0.2.13

### Patch Changes

- Updated dependencies [6dc9e0d]
  - @milaboratories/pl-middle-layer@1.54.3
  - @milaboratories/pl-client@2.18.5

## 0.2.12

### Patch Changes

- @milaboratories/pl-client@2.18.4
- @milaboratories/pl-middle-layer@1.54.2

## 0.2.11

### Patch Changes

- @milaboratories/pl-middle-layer@1.54.1

## 0.2.10

### Patch Changes

- Updated dependencies [74a2ffa]
  - @milaboratories/pl-middle-layer@1.54.0
  - @milaboratories/pl-client@2.18.3

## 0.2.9

### Patch Changes

- Updated dependencies [0da8bdc]
  - @milaboratories/pl-middle-layer@1.53.3

## 0.2.8

### Patch Changes

- @milaboratories/pl-middle-layer@1.53.2

## 0.2.7

### Patch Changes

- @milaboratories/pl-middle-layer@1.53.1

## 0.2.6

### Patch Changes

- Updated dependencies [cfee265]
  - @milaboratories/pl-middle-layer@1.53.0
  - @milaboratories/pl-client@2.18.2

## 0.2.5

### Patch Changes

- @milaboratories/pl-client@2.18.1
- @milaboratories/pl-middle-layer@1.52.1

## 0.2.4

### Patch Changes

- Updated dependencies [6078a1d]
- Updated dependencies [ccb1a70]
  - @milaboratories/pl-middle-layer@1.52.0

## 0.2.3

### Patch Changes

- Updated dependencies [d59f5fe]
  - @milaboratories/pl-middle-layer@1.51.0
  - @milaboratories/pl-client@2.18.0

## 0.2.2

### Patch Changes

- Updated dependencies [5b83cd7]
  - @milaboratories/pl-middle-layer@1.50.1

## 0.2.1

### Patch Changes

- Updated dependencies [220275d]
  - @milaboratories/pl-middle-layer@1.50.0

## 0.2.0

### Minor Changes

- 698fdbb: Add pl-cli: CLI tool for Platforma server state manipulation

  New CLI tool with the following commands:

  - `pl-cli project list` — list all projects
  - `pl-cli project info` — show project details
  - `pl-cli project duplicate` — duplicate a project with auto-rename
  - `pl-cli project rename` — rename a project
  - `pl-cli project delete` — delete a project
  - `pl-cli admin copy-project` — copy project between users (controller auth)
  - `pl-cli admin user-list` — list user roots on server

  All commands support `--format text` (default) and `--format json` output.
