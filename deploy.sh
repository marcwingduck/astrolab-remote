#!/usr/bin/env bash
#
# deploy.sh - build the web app into a temporary folder and sync it to astrolab.marclieser.de via
# SFTP (or FTPS). The build only renames css and js after their content (style.<hash>.css) and points
# index.html there, so browsers never use old css or js. index.html carries the build's version
# and checks version.txt on load, so a cached old page replaces itself (the server ignores
# .htaccess, which would otherwise keep index.html from being cached). Nothing is left behind here: this folder is also the Android app's assets.
#
# Usage:
#   ./deploy.sh              # build + sync (deletes remote files not in the build)
#   ./deploy.sh --dry-run    # build, show what would change, without uploading/deleting
#   ./deploy.sh --build-only # build into ./dist to look at, no upload (delete it afterwards)
#
# Env:
# Settings, from the environment or from .env next to this script (gitignored, see .env.example):
#   DEPLOY_FTP_HOST   server (required)
#   DEPLOY_FTP_USER   login (required)
#   DEPLOY_FTP_DIR    remote directory to sync into (required)
#   DEPLOY_PROTO      sftp (default) or ftp (FTPS)
#   DEPLOY_FTP_PASS   password (prompted for if unset; never hardcode it)

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# KEY=VALUE from .env, for what the environment doesn't set already
env_value() {
    local v
    v=$(sed -n "s/^$1=//p" "${SRC_DIR}/.env" 2>/dev/null | tail -1)
    if [[ ${#v} -ge 2 && ( "$v" == \"*\" || "$v" == \'*\' ) ]]; then
        v=${v:1:${#v}-2}
    fi
    printf '%s' "$v"
}
DEPLOY_FTP_HOST="${DEPLOY_FTP_HOST:-$(env_value DEPLOY_FTP_HOST)}"
DEPLOY_FTP_USER="${DEPLOY_FTP_USER:-$(env_value DEPLOY_FTP_USER)}"
DEPLOY_FTP_DIR="${DEPLOY_FTP_DIR:-$(env_value DEPLOY_FTP_DIR)}"
DEPLOY_PROTO="${DEPLOY_PROTO:-$(env_value DEPLOY_PROTO)}"
DEPLOY_PROTO="${DEPLOY_PROTO:-sftp}"

# the site's files
STATIC=(index.html manifest.json .htaccess assets)
# these get their content hash in the name, so no browser can keep an old one (the server sends no
# caching rules). In this order: a file comes after the ones it names (the manifest names the icons).
HASHED=(assets/icon-192.png assets/icon-512.png assets/favicon.png assets/paris.jpg manifest.json css/style.css js/script.js)
REFERRERS=(index.html manifest.json)  # where they are named

DRY_RUN=0
BUILD_ONLY=0

for arg in "$@"; do
    case "$arg" in
        --dry-run)    DRY_RUN=1 ;;
        --build-only) BUILD_ONLY=1 ;;
        -h|--help)
            sed -n '2,18p' "$0"
            exit 0
            ;;
        *)
            echo "unknown option: $arg" >&2
            exit 1
            ;;
    esac
done

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# --- build ---
if [[ "${BUILD_ONLY}" -eq 1 ]]; then
    DIST_DIR="${SRC_DIR}/dist"
    rm -rf "${DIST_DIR}"
    mkdir -p "${DIST_DIR}"
else
    DIST_DIR="$(mktemp -d)"
    trap 'rm -rf "${DIST_DIR}"' EXIT
fi

for path in "${STATIC[@]}"; do
    # -p keeps modification times, so the mirror skips files that haven't changed
    [[ -e "${SRC_DIR}/${path}" ]] && cp -Rp "${SRC_DIR}/${path}" "${DIST_DIR}/"
done
find "${DIST_DIR}" -name .DS_Store -delete

for src in "${HASHED[@]}"; do
    file="${DIST_DIR}/${src}"
    if [[ ! -e "${file}" ]]; then  # css and js aren't in STATIC
        mkdir -p "$(dirname "${file}")"
        cp -p "${SRC_DIR}/${src}" "${file}"
    fi
    hash="$(shasum -a 256 "${file}" | cut -c1-8)"  # as built: the manifest already names hashed icons
    out="${src%.*}.${hash}.${src##*.}"
    mv "${file}" "${DIST_DIR}/${out}"
    # point every reference at the hashed name; fail if nothing references the file
    found=0
    for ref in "${REFERRERS[@]}"; do
        [[ -e "${DIST_DIR}/${ref}" ]] || continue  # the manifest, once hashed itself
        if grep -q "\"${src}\"" "${DIST_DIR}/${ref}"; then
            sed -i '' "s#\"${src}\"#\"${out}\"#g" "${DIST_DIR}/${ref}"
            found=1
        fi
    done
    [[ "${found}" -eq 1 ]] || { echo "nothing references ${src}" >&2; exit 1; }
    log "${src} -> ${out}"
done

# the build's version, stamped into index.html and written to version.txt (see index.html):
# index.html names every hashed file, so any change anywhere changes it
version="$(shasum -a 256 "${DIST_DIR}/index.html" | cut -c1-8)"
grep -q "'BUILD'" "${DIST_DIR}/index.html" || { echo "index.html has no BUILD stamp" >&2; exit 1; }
sed -i '' "s#'BUILD')#'${version}')#" "${DIST_DIR}/index.html"
printf '%s\n' "${version}" > "${DIST_DIR}/version.txt"
log "version ${version}"

log "build: $(find "${DIST_DIR}" -type f | wc -l | tr -d ' ') files, $(du -sh "${DIST_DIR}" | cut -f1)"

if [[ "${BUILD_ONLY}" -eq 1 ]]; then
    log "build-only: see ${DIST_DIR}, skipping upload"
    exit 0
fi

for key in DEPLOY_FTP_HOST DEPLOY_FTP_USER DEPLOY_FTP_DIR; do
    if [[ -z "${!key}" ]]; then
        echo "${key} is not set: put it in .env (see .env.example) or the environment" >&2
        exit 1
    fi
done

if ! have lftp; then
    echo "lftp is required (brew install lftp)" >&2
    exit 1
fi

if [[ -z "${DEPLOY_FTP_PASS:-}" ]]; then
    if [[ -t 0 ]]; then
        read -r -s -p "FTP password for ${DEPLOY_FTP_USER}@${DEPLOY_FTP_HOST}: " DEPLOY_FTP_PASS
        echo
    else
        echo "DEPLOY_FTP_PASS is not set and no terminal to prompt on" >&2
        exit 1
    fi
fi

mirror_opts=(-R --delete)
if [[ "${DRY_RUN}" -eq 1 ]]; then
    mirror_opts+=(--dry-run)
fi

log "syncing build to ${DEPLOY_PROTO}://${DEPLOY_FTP_HOST}:${DEPLOY_FTP_DIR} (delete=on, dry-run=${DRY_RUN})"

ftp_script="$(mktemp)"
chmod 600 "${ftp_script}"
trap 'rm -f "${ftp_script}"; rm -rf "${DIST_DIR}"' EXIT

{
    printf 'set ftp:ssl-force true\n'
    printf 'set ssl:verify-certificate true\n'
    # fail within a minute instead of retrying silently for ages (e.g. when the host blocks us)
    printf 'set net:timeout 15\n'
    printf 'set net:max-retries 2\n'
    printf 'set net:reconnect-interval-base 5\n'
    # sftp: accept the host's key on first contact instead of waiting for a yes nobody types
    printf 'set sftp:auto-confirm yes\n'
    printf 'open -u "%s","%s" "%s://%s"\n' "${DEPLOY_FTP_USER}" "${DEPLOY_FTP_PASS}" "${DEPLOY_PROTO}" "${DEPLOY_FTP_HOST}"
    printf 'mirror %s "%s" "%s"\n' "${mirror_opts[*]}" "${DIST_DIR}" "${DEPLOY_FTP_DIR}"
    printf 'bye\n'
} > "${ftp_script}"

set +e
lftp -f "${ftp_script}" 2>&1 | sed -E 's#((s?ftps?)://[^:/@[:space:]]+:)[^@[:space:]]+(@)#\1REDACTED\3#g'
status=${PIPESTATUS[0]}
set -e
rm -f "${ftp_script}"
if [[ "${status}" -ne 0 ]]; then
    echo "upload failed (lftp exit ${status}); DEPLOY_PROTO=ftp or =sftp tries the other way" >&2
    exit "${status}"
fi

log "done."
