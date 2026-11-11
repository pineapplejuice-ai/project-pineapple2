#!/bin/bash
# Runs once when the Postgres data directory is first created.
# Two roles on purpose: migrations run as the table owner, the API connects as an unprivileged
# role so that row-level security policies apply to every query it makes.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE nexbill_owner LOGIN PASSWORD '${NEXBILL_OWNER_PASSWORD}' CREATEDB;
CREATE ROLE nexbill_app LOGIN PASSWORD '${NEXBILL_APP_PASSWORD}';
CREATE DATABASE nexbill OWNER nexbill_owner;
SQL
