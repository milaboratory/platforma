#!/usr/bin/env bash

set -o nounset
set -o errexit

script_dir=$(cd "$(dirname "${0}")" && pwd)
cd "${script_dir}"

dropUnusedImports=false
if [ "${1:-}" = "fix" ]; then
    dropUnusedImports=true
fi

hasLostImports=false

mapfile -t sources < <(find src -type f -name '*.tengo')

while read -r file; do

    mapfile -t imports < <(cat "${file}" | grep -E '= ?import\(".*:.+"\)' | awk -F'[ :=]' '{print $1}')
    
    lostImports=()
    for im in "${imports[@]}"; do
        if ! cat "${file}" | grep -E "${im}\." > /dev/null; then
            lostImports+=("${im}");
        fi
    done

    if [ "${#lostImports[@]}" -ne 0 ]; then
        hasLostImports=true
        echo "Found unused imports in ${file}: ${lostImports[@]}"

        if $dropUnusedImports; then
            echo "Fixing file ${file} ..."
            for lostImport in "${lostImports[@]}"; do
                cp "${file}" "${file}.tmp"
                cat "${file}.tmp" | grep -E -v "\s*${lostImport}\s*:?=\s*import\(\"" > "${file}"
                rm "${file}.tmp"
            done
        fi
    fi

done < <(printf "%s\n" "${sources[@]}")

if $hasLostImports && ! $dropUnusedImports; then
    exit 1
fi
