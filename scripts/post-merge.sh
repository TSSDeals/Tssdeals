#!/bin/bash
set -e

# Install dependencies (idempotent, non-interactive).
npm install

# NOTE: Do NOT run `npm run db:push` here. Drizzle push wants to drop the
# deals.search_vector tsvector column (it isn't modeled in the ORM schema),
# which would break full-text search. Schema changes are applied idempotently
# by runStartupMigrations() in server/index.ts (CREATE ... IF NOT EXISTS plus
# targeted direct SQL) when the app boots, so no push step is needed here.
