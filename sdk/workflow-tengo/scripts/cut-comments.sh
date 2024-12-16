#!/usr/bin/env bash

set -o nounset
set -o errexit

script_dir=$(cd "$(dirname "${0}")" && pwd)
cd "${script_dir}/.."

operation_mode="${1:-compact}"
msg_marker="compact-sources.sh: save state of repository before sources modification"

drop-comments() {
    awk '
        BEGIN { in_comment = 0 }

         /^\s*\/\*/ { in_comment = 1 }                               # Start of comment block
             /\*\// { if (in_comment) { in_comment = 0; next } }     # End of comment block
        !in_comment && !/^[ \t]*\/\// { sub(/^[ \t]+/, ""); print }  # Print lines that are not within comment blocks
         in_comment { printf "\n" }                                  # Print empty lines instead of comments to keep lines numbering
    '
}

random() {
    date +%s%N | md5sum | head -c 10
}

get-stash-id() {
    git stash list |
        grep "${msg_marker}" |
        awk -F':' '{print $1}' |
        head -n 1
}

if [ "${operation_mode}" != "compact" ] && [ "${operation_mode}" != "restore" ]; then
    echo "Usage: $0 [<operation-mode>]"
    echo "  Operation mode is the action script needs to do with tengo code:"
    echo "    - 'compact': make source codes more compact: drop comments (keeping lines numbering in a source code) and indentation"
    echo "    - 'restore': restore source codes to the state before compaction"
fi

mapfile -t sources < <(find src -type f -name '*.tengo')

if [ "${operation_mode}" = "compact" ]; then
    if [ -e ./src/.compacted ]; then
        echo "$0: tengo sources are already compacted"
        exit 0
    fi

    bkp_suffix=$(random)
    rsync -a ./src/ "./src.${bkp_suffix}"
    echo "${bkp_suffix}" >./src/.compacted

    echo "$0: removing comments and indentation from tengo sources to make them more compact..."
    while read -r file; do
        cp "${file}" "${file}.tmp"
        cat "${file}.tmp" | drop-comments >"${file}"
        rm -f "${file}.tmp"

    done < <(printf "%s\n" "${sources[@]}")

elif [ "${operation_mode}" = "restore" ]; then
    if ! [ -f ./src/.compacted ]; then
        echo "$0: nothing to restore"
        exit 0
    fi

    bkp_suffix=$(cat ./src/.compacted)

    rm -r ./src
    mv "./src.${bkp_suffix}" ./src
fi
