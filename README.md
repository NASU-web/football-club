# NJUIT INT FC

This project now uses PostgreSQL for persistence (no JSON-file storage at runtime).

## PostgreSQL (Railway)

Set your database URL before starting the server:

```powershell
$env:DATABASE_URL="<your-railway-postgres-url>"
npm start
```

Notes:
- The app is PostgreSQL-only at runtime; local JSON data files are no longer used.
- If running outside Railway network, use Railway's public Postgres URL instead of the internal host.
- Database health endpoint: GET /api/health/db
