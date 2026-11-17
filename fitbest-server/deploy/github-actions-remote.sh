#!/usr/bin/env bash
set -euo pipefail
path=$1 archive=$2 project=$3 namespace=$4 tag=$5 run=$6 attempt=$7
umask 077
release="$path/.fitbest-releases/$run-$attempt"
mkdir -p "$release"
trap 'rm -f -- "$archive"' EXIT
tar -xf "$archive" -C "$release"
chmod 600 "$release/.env"

# The first deployment must retain the existing production configuration and keys.
if [[ ! -L $path/.fitbest-current && -f $path/.env ]] && ! cmp -s "$path/.env" "$release/.env"; then
  echo 'First deployment requires FITBEST_PRODUCTION_ENV to match the existing server .env.' >&2
  exit 1
fi

export FITBEST_IMAGE_NAMESPACE="$namespace" FITBEST_RELEASE_TAG="$tag"
compose=(docker compose --project-directory "$path" --project-name "$project" --env-file "$release/.env" -f "$release/docker-compose.yml" -f "$release/docker-compose.release.yml" -f "$release/docker-compose.registry.yml")
"${compose[@]}" config --quiet
if ! docker volume inspect "${project}_pg_data" "${project}_redis_data" > /dev/null; then
  echo 'Existing PostgreSQL or Redis volume not found; verify DEPLOY_COMPOSE_PROJECT.' >&2
  exit 1
fi
if [[ -L $path/.fitbest-current ]]; then
  old_password=$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?POSTGRES_PASSWORD[[:space:]]*=[[:space:]]*//p' "$path/.fitbest-current/.env" | tail -n 1)
  new_password=$(sed -nE 's/^[[:space:]]*(export[[:space:]]+)?POSTGRES_PASSWORD[[:space:]]*=[[:space:]]*//p' "$release/.env" | tail -n 1)
  if [[ $old_password != "$new_password" ]]; then
    echo 'Changing POSTGRES_PASSWORD requires a separate database password migration.' >&2
    exit 1
  fi
fi
docker image inspect "${namespace}-server:${tag}" "${namespace}-web:${tag}" > /dev/null
"${compose[@]}" up --no-build --pull never --wait --wait-timeout 180
host_address=$("${compose[@]}" port fitbest-server 8080 | head -n 1)
host_port=${host_address##*:}
[[ $host_port =~ ^[0-9]+$ ]]
for route in actuator/health fitbest/ fitbest-hd/ fit-best/ hyrox/ hyrox/HD/ btwe/ btwe/HD/ fitbestwebsite/ console/; do
  curl --fail --silent --show-error "http://127.0.0.1:$host_port/$route" > /dev/null
done
ln -sfn "$release" "$path/.fitbest-current.next"
mv -Tf "$path/.fitbest-current.next" "$path/.fitbest-current"
echo "Production deployment verified: $tag"
