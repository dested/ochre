import { execFileSync } from 'node:child_process'
import { Client } from 'pg'
import { E2E_DATABASE_URL } from './db'

// Bring the isolated test database up to the committed migrations (the same
// `migrate deploy` production runs), then wipe it so sign-up uses a fresh fixed
// user and screenshots are byte-for-byte reproducible. Runs once per
// `playwright test`. The database itself must exist (`createdb ochre_test`).
export default async function globalSetup() {
  // TRUNCATE below is destructive — refuse anything that isn't a *_test database.
  const dbName = new URL(E2E_DATABASE_URL).pathname.slice(1)
  if (!dbName.endsWith('_test')) {
    throw new Error(`E2E_DATABASE_URL must point at a *_test database, got "${dbName}"`)
  }
  execFileSync('bun', ['x', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'inherit',
  })
  const client = new Client({ connectionString: E2E_DATABASE_URL })
  await client.connect()
  await client.query(
    'TRUNCATE TABLE "post", "session", "account", "verification", "user" RESTART IDENTITY CASCADE'
  )
  await client.end()
}
