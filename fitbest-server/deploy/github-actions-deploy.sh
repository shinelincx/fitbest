#!/usr/bin/env bash
set -euo pipefail

: "${DEPLOY_HOST:?}" "${DEPLOY_USER:?}" "${DEPLOY_PATH:?}" "${DEPLOY_COMPOSE_PROJECT:?}" "${DEPLOY_SSH_PRIVATE_KEY:?}" "${DEPLOY_SSH_KNOWN_HOSTS:?}" "${FITBEST_PRODUCTION_ENV:?}"
DEPLOY_PORT=${DEPLOY_PORT:-22}
[[ $DEPLOY_HOST =~ ^[a-zA-Z0-9.-]+$ && $DEPLOY_USER =~ ^[a-zA-Z0-9_-]+$ && $DEPLOY_PORT =~ ^[0-9]+$ ]]
[[ $DEPLOY_PATH =~ ^/[a-zA-Z0-9_./-]+$ && $DEPLOY_PATH != *..* && $DEPLOY_PATH != / ]]
[[ $DEPLOY_COMPOSE_PROJECT =~ ^[a-z0-9][a-z0-9_-]*$ ]]
[[ $FITBEST_RELEASE_TAG =~ ^sha-[a-f0-9]{40}$ && $GITHUB_RUN_ID =~ ^[0-9]+$ && $GITHUB_RUN_ATTEMPT =~ ^[0-9]+$ ]]

umask 077
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
printf '%s\n' "$DEPLOY_SSH_PRIVATE_KEY" > "$work/key"
printf '%s\n' "$DEPLOY_SSH_KNOWN_HOSTS" > "$work/known_hosts"
printf '%s' "$FITBEST_PRODUCTION_ENV" > "$work/.env"
if [[ $(tail -c 1 "$work/.env" | wc -l) -eq 0 ]]; then printf '\n' >> "$work/.env"; fi
cp fitbest-server/docker-compose{.yml,.release.yml,.registry.yml} "$work/"
archive="$DEPLOY_PATH/.fitbest-upload-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT.tar"
ssh_options=(-i "$work/key" -p "$DEPLOY_PORT" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$work/known_hosts")
target="$DEPLOY_USER@$DEPLOY_HOST"
tar -C "$work" -cf - .env docker-compose.yml docker-compose.release.yml docker-compose.registry.yml |
  ssh "${ssh_options[@]}" "$target" "umask 077; mkdir -p '$DEPLOY_PATH'; cat > '$archive'"
ssh "${ssh_options[@]}" "$target" bash -s -- "$DEPLOY_PATH" "$archive" "$DEPLOY_COMPOSE_PROJECT" "$FITBEST_IMAGE_NAMESPACE" "$FITBEST_RELEASE_TAG" "$GITHUB_RUN_ID" "$GITHUB_RUN_ATTEMPT" < fitbest-server/deploy/github-actions-remote.sh
