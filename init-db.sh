#!/usr/bin/env bash
if [ -z "$DATABASE_URL" ]; then echo "set DATABASE_URL first"; exit 1; fi
npm install --ignore-scripts && npx drizzle-kit push && npx tsx src/db/seed.ts && echo "DB ready."
