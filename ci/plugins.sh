#!/bin/bash
# Two plugin instances for the desktop's run, made the way a person makes them with the released CLI:
# `meridian plugin new` (the reference plugin), `connect` (the person allows it in a browser: ci/connect.mjs),
# `upload` (built here with docker, into the deployment's own registry) and `launch`, twice, under two instances.
#
# Reads: RUN_DIR, KUBECONFIG. Writes the instances' names to $RUN_DIR/instances.
set -euo pipefail
: "${RUN_DIR:?}" "${KUBECONFIG:?}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD=http://meridian.localhost
INSTANCES=(reference second)

meridian plugin new reference-plugin --into "$RUN_DIR/reference-plugin"

meridian connect "$DASHBOARD" >"$RUN_DIR/connect.log" 2>&1 &
connecting=$!
node "$HERE/connect.mjs" "$RUN_DIR/connect.log" "$RUN_DIR/person.json" "$DASHBOARD"
wait "$connecting" || { echo "plugins: meridian connect failed" >&2; sed -E 's/(code|state|code_challenge)=[^&[:space:]]*/\1=…/g' "$RUN_DIR/connect.log" >&2; exit 1; }

meridian plugin upload --dir "$RUN_DIR/reference-plugin"
for instance in "${INSTANCES[@]}"; do
  meridian plugin launch reference-plugin 0.1.0 --instance "$instance" --yes
done
for instance in "${INSTANCES[@]}"; do
  echo "plugins: waiting for ${instance}, at most 600s"
  kubectl -n meridian wait --for=condition=Available --timeout=600s "deployment/meridian-meridian-runtime-plugin-${instance}"
done
meridian plugin list
(IFS=,; echo "${INSTANCES[*]}") >"$RUN_DIR/instances"
