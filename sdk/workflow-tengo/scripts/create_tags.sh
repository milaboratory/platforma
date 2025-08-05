#/usr/bin/env bash

# The script creates ctags, install them
# with `brew install universal-ctags`.
# For vscode, you should also install ctags extension.
#
# Usage for vscode: ./create_tags.sh
# Usage for emacs: ./create_tags.sh TAGS true -e

function check_cursor_command() {
   if ! command -v cursor &> /dev/null; then
      echo "Warning: cursor command not found. Extension installation will be skipped."
      echo "You can download Cursor from: https://cursor.sh/"
      return 1
   fi
   echo "✓ Cursor command found"
   return 0
}

function check_extension_installed() {
   if cursor --list-extensions | grep -q "jtanx.ctagsx"; then
      echo "✓ ctagsx extension is already installed"
      return 0
   else
      echo "✗ ctagsx extension is not installed"
      return 1
   fi
}

function install_cursor_extension() {
   echo "Installing cursor extension..."
   echo "Cloning ctagsx repository to '$HOME/ctagsx'..."
   cd $HOME && git clone https://github.com/jtanx/ctagsx.git

   echo "Installing dependencies..."
   cd ctagsx && npm install && npm run build

   echo "Packaging extension..."
   npx vsce package

   echo "Listing package..."
   extension=$(ls -la *.vsix | head -1 | awk '{print $9}')
   echo "Found extension: $extension"

   echo "Installing extension..."
   cursor --install-extension $extension

   rm -rf $HOME/ctagsx || true
}

function ensure_extension_installed() {
   if ! check_cursor_command; then
      echo "Skipping extension installation (cursor not available)"
      return 0
   fi
   
   if ! check_extension_installed; then
      echo "Installing ctagsx extension..."
      install_cursor_extension
      
      # Verify installation
      if check_extension_installed; then
         echo "✓ Extension installed successfully"
      else
         echo "✗ Failed to install extension"
         exit 1
      fi
   fi
}

ensure_extension_installed

# turn on for debug
set -o nounset
set -o errexit

# This turns on `**` functionality in glob patterns
shopt -s globstar

# the name of the file
tags_file_name=${1:-.tags}

# should create tags from .. (if true) or from . (if false)
if [[ "${2:-false}" == "true" ]]; then
    from_parent_root=..
else
    from_parent_root=.
fi;

# -e for emacs, nothing for vscode
other_args=${3:-}

echo
echo
echo Create ctags file \""${tags_file_name}"\" from this root dir: \""${from_parent_root}"\", Additional args: ${other_args}
echo

# see https://docs.ctags.io/en/latest/man/ctags-optlib.7.html#perl-pod
ctags -f "${tags_file_name}" ${other_args} \
      --langdef=tengo \
      --map-tengo=+.tengo \
      --kinddef-tengo=f,function,function \
      --regex-tengo='/^\s*(.*)(:| :=| =) ?func.*/\1/f/' \
      --kinddef-tengo=c,constant,constant \
      --regex-tengo='/^\s*(.*) := (\"|\{).*/\1/c/' \
      --exclude='./**/node_modules/@platforma-sdk/**' \
      --exclude='./**/node_modules/@platforma-open/**' \
      ${from_parent_root}/**/src/**/*.tengo \
      2>/dev/null

echo Done.
