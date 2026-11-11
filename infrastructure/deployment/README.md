# Deployment notes

NEXBILL is a modular monolith: one API container, one web container, one PostgreSQL database.

## Minimum production checklist

1. **Database roles.** Create `nexbill_owner` (owns the schema, runs migrations) and `nexbill_app`
   (used by the API, no ownership, no `BYPASSRLS`). Row-level security only protects you if the
   API does **not** connect as the table owner or a superuser.
2. **Secrets.** `JWT_SECRET` (32+ random chars) and database passwords come from your secret
   manager / orchestrator, never from the image or the repository. The API refuses to start in
   production with a weak `JWT_SECRET`.
3. **Migrations.** Run `prisma migrate deploy` with `DATABASE_MIGRATION_URL` as a release step
   before starting the new API version (the compose file does this with the `migrate` job).
4. **TLS.** Terminate HTTPS at a load balancer / reverse proxy in front of the web container. The
   refresh cookie is `Secure` in production and the API trusts one proxy hop for client IPs.
5. **Single origin.** Browsers talk only to the web origin; `/api/*` is proxied to the API, so auth
   cookies stay first-party. Expose the API publicly only for native clients.
6. **Connection pool.** `DB_POOL_SIZE` × API replicas must stay below Postgres `max_connections`;
   put PgBouncer (session mode) in front when you scale out.
7. **Backups.** Enable point-in-time recovery (WAL archiving) plus a daily logical dump kept
   off-site, and rehearse a restore. See docs/SECURITY.md.
8. **Monitoring.** `/api/v1/health` for liveness/readiness; logs are JSON lines with a request id
   (`x-request-id`) ready for any log shipper. Wire 5xx logs to your error tracker.

## Not included yet

Redis/BullMQ workers, object storage and a CDN are not required by the current feature set and are
not deployed. Add them when background jobs (email/SMS delivery, scheduled reports) and file
uploads are implemented. See docs/STATUS.md.
