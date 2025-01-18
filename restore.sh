#!/bin/bash
pg_restore -U ${POSTGRES_USER} -d tennis_coaching /docker-entrypoint-initdb.d/tennis_coaching_db.backup