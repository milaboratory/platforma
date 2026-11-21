---
"@platforma-sdk/block-tools": patch
---

`structure check` and `structure refresh` examine the files that `block.meta.logo` and `block.meta.organization.logo` link to with `file:`. The commands do not change these files.

The commands fail when a logo is damaged: a tool read the image and wrote it again as UTF-8 text. An image viewer cannot open such a file. Replace the file with the original image.

The commands print a warning, and the exit code does not change, in these cases:

- The file does not exist.
- The link goes to a directory.
- The link goes outside the block.
- The file is not a PNG, JPEG, GIF, WebP, AVIF or SVG image.

`structure refresh --update-deps-only` does not examine the logos.
