#!/usr/bin/env bash

set -euo pipefail

readonly project_directory=/opt/turkiye
readonly environment_file=/etc/turkiye/turkiye.env
readonly repository_key=/root/.ssh/turkiye_github_deploy

test -r "$environment_file"
test -r "$repository_key"

cd "$project_directory"
test -d .git

export GIT_SSH_COMMAND="ssh -i $repository_key -o IdentitiesOnly=yes"
git pull --ff-only origin main

docker compose --env-file "$environment_file" -f compose.prod.yml config --quiet
docker compose --env-file "$environment_file" -f compose.prod.yml up -d --build --remove-orphans
docker compose --env-file "$environment_file" -f compose.prod.yml ps
