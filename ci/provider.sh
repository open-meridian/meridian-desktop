#!/bin/bash
# A firm's own OpenID Connect provider for the run: a throwaway Keycloak in Docker on this runner, the image
# pinned by digest in the workflow. One realm, one confidential client for the dashboard, one person in one
# group, and a mapper that puts the person's groups in the ID token's `groups` claim.
#
# Why Keycloak: the dashboard asks every sign-in to be fresh (prompt=login, max_age=0) and checks the ID token's
# auth_time against it, and Keycloak honours both and states auth_time; it maps a group into the token with a
# stock mapper; and it lets the client's redirect address be given as a pattern, so nothing here has to know the
# dashboard's callback path.
#
# The issuer is one string for the dashboard's pod and for this runner, which the dashboard checks every token's
# `iss` against: http://host.k3d.internal:8080. k3d puts that name in the cluster's DNS, pointing at this
# machine; /etc/hosts points it at this machine for the runner's own browsers.
#
# The person's password and the client's secret are drawn here, kept in files only this job reads (and the
# realm file Keycloak imports), and never printed.
#
# Reads: KEYCLOAK_IMAGE, RUN_DIR, RUNNER_TEMP. Writes $RUN_DIR/firm-person.json, $RUN_DIR/client-secret and
# $RUN_DIR/issuer.
set -euo pipefail
: "${KEYCLOAK_IMAGE:?}" "${RUN_DIR:?}" "${RUNNER_TEMP:?}"
HOST=host.k3d.internal
ISSUER="http://${HOST}:8080/realms/meridian"
READY_SECONDS=240

grep -q "[[:space:]]${HOST}\$" /etc/hosts || echo "127.0.0.1 ${HOST}" | sudo tee -a /etc/hosts >/dev/null

draw() { python3 -c 'import secrets; print(secrets.token_urlsafe(24))'; }
umask 077
password="$(draw)"; secret="$(draw)"; admin="$(draw)"
printf '%s' "$secret" >"$RUN_DIR/client-secret"
python3 - "$RUN_DIR/firm-person.json" "$password" <<'PY'
import json, sys
json.dump({"name": "pat", "password": sys.argv[2]}, open(sys.argv[1], "w"))
PY
printf '%s' "$ISSUER" >"$RUN_DIR/issuer"

# Keycloak runs as its own user, so the realm it imports is readable by it, in a directory of its own.
import_dir="$RUNNER_TEMP/provider-import"
mkdir -p "$import_dir" && chmod 755 "$import_dir"
umask 022
python3 - "$import_dir/meridian-realm.json" "$password" "$secret" <<'PY'
import json, sys
path, password, secret = sys.argv[1:]
realm = {
    "realm": "meridian",
    "enabled": True,
    "groups": [{"name": "meridian-admins"}],
    "users": [{
        "username": "pat", "enabled": True, "email": "pat@example.com", "emailVerified": True,
        "firstName": "Pat", "lastName": "Example", "requiredActions": [],
        "credentials": [{"type": "password", "value": password, "temporary": False}],
        "groups": ["/meridian-admins"],
    }],
    "clients": [{
        "clientId": "meridian-dashboard", "enabled": True, "protocol": "openid-connect",
        "publicClient": False, "secret": secret, "clientAuthenticatorType": "client-secret",
        "standardFlowEnabled": True, "directAccessGrantsEnabled": False, "implicitFlowEnabled": False,
        "redirectUris": ["http://meridian.localhost/*"], "webOrigins": ["http://meridian.localhost"],
        "attributes": {"pkce.code.challenge.method": "S256"},
        "protocolMappers": [{
            "name": "groups", "protocol": "openid-connect", "protocolMapper": "oidc-group-membership-mapper",
            "config": {"claim.name": "groups", "full.path": "false", "id.token.claim": "true",
                       "access.token.claim": "true", "userinfo.token.claim": "true"},
        }],
    }],
}
with open(path, "w") as f:
    json.dump(realm, f)
PY
chmod 644 "$import_dir/meridian-realm.json"

docker run -d --name provider -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin -e KC_BOOTSTRAP_ADMIN_PASSWORD="$admin" \
  -e KC_HOSTNAME="http://${HOST}:8080" \
  -v "$import_dir:/opt/keycloak/data/import:ro" \
  "$KEYCLOAK_IMAGE" start-dev --import-realm --http-port=8080 >/dev/null

echo "provider: waiting for ${ISSUER}, at most ${READY_SECONDS}s"
start=$SECONDS
until curl -fsS "${ISSUER}/.well-known/openid-configuration" -o "$RUN_DIR/discovery.json" 2>/dev/null; do
  if (( SECONDS - start >= READY_SECONDS )); then
    echo "provider: never answered" >&2
    docker logs provider 2>&1 | tail -60 >&2
    exit 1
  fi
  sleep 3
done
said="$(jq -r .issuer "$RUN_DIR/discovery.json")"
[ "$said" = "$ISSUER" ] || { echo "provider: states its issuer as ${said}, not ${ISSUER}" >&2; exit 1; }
echo "provider: ${ISSUER} answers, and states itself as that issuer"
