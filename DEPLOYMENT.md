# Deployment preparation

The source is ready for hosting integration; no live deployment is claimed.

## Configuration

- Set `NODE_ENV=production`, `PUBLIC_ORIGIN=https://your-domain`, and `FUEL_DATA_DIR` to persistent storage.
- `BIND_ADDRESS` defaults to loopback; the container uses `0.0.0.0` behind its HTTPS proxy.
- Hosted requests require the configured hostname and origin. Session cookies use Secure and HTTP responses include HSTS.
- Production startup requires a stored active Super Admin. Public initial account setup is disabled.
- `GET /api/health` provides a health check without returning operational records.

## Optional single-server pilot

The Dockerfile, compose.yaml and Caddyfile support a Node.js server behind Caddy. Set `PORTAL_DOMAIN` in a private `.env` using `.env.example`, configure DNS and ports 80/443, and privately restore a verified backup into the persistent data volume before starting. Do not commit or publicly distribute backups.

Use exactly one application process with the JSON store. Preserve the data volume across deployments. Stop writes during final migration, verify record counts and evidence, and retain a private rollback backup.

Caddy's HTTPS documentation: https://caddyserver.com/docs/automatic-https

## Validation and remaining work

264 application checks and 17 deployment checks passed locally on Node 20. Docker is unavailable in the development environment, so container build, Node 24 compatibility, remote HTTPS and live operation still need verification.

The current app stores data locally; Supabase integration has not been implemented. Choose the application host before completing the cloud architecture. GitHub hosts this source repository, not the running Node.js application.

Before production acceptance, complete database migration, shared sessions, account recovery, server-side image validation, off-device backups, monitoring, rollback and live device testing. Current sessions clear on restart. Login rate limiting uses the direct peer address, so requests through one reverse proxy share that limit.
