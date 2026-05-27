#!/bin/sh
set -eu

TEST_DB="${POSTGRES_TEST_DB:-hrms_platform_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
SELECT 'CREATE DATABASE ${TEST_DB}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${TEST_DB}')\\gexec
SQL

