# Fuel Station Operations Portal

A Node.js portal with Super Admin, Station Admin and Salesman roles.

## Features

- Station and staff management with station-level access controls.
- Fuel types, historical rates, machines, nozzles and shift assignments.
- Opening and closing meter readings, photographic evidence and cash records.
- Fuel sales, revenue, variance dashboards and CSV/Excel reports.
- Daily, weekly or monthly administrator meter reconciliation against salesman readings over the same interval.
- Audit history and verified backup/restore tools.

## Run locally

Requires Node.js 20 or later. No dependency installation is needed.

```sh
npm start
```

Open http://127.0.0.1:4310 and create the first Super Admin. No accounts, passwords, operational data or photos are included in this repository.

## Verify

```sh
npm test
```

The automated suites cover application behavior and hosted configuration, using isolated temporary records.

## Data and deployment

Local records are in `data/store.json`; photos are in `data/evidence/`. Both are excluded from version control and container builds. Back up both together using `backup.cjs`. Never commit backups or secrets.

The default server is local-only. Hosted mode requires an HTTPS `PUBLIC_ORIGIN`, a persistent `FUEL_DATA_DIR`, and a previously provisioned active Super Admin. See [DEPLOYMENT.md](DEPLOYMENT.md) for the optional single-server container configuration and outstanding production work.

This is a development build with deployment preparation. It is not yet a verified live production service. The JSON store supports one process only, sessions are in memory, and Supabase migration, account recovery and production acceptance remain pending.
