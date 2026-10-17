// The isolated e2e database — never your dev DB. Override with E2E_DATABASE_URL.
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/ochre_test'
