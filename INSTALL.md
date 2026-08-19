# MCLS Super Admin Portal — installation

MSME Competitive (LEAN) Scheme — Master Administration portal.
Angular 22 front end, .NET 10 Web API, SQL Server Express.

---

## 1. Prerequisites

| Component | Version | Notes |
|---|---|---|
| SQL Server Express | 2019 or later | Instance `.\SQLEXPRESS`, Windows authentication |
| .NET SDK | 10.0 | `dotnet --version` |
| Node.js | 20 LTS or later | `node --version` — only needed to rebuild the front end |
| sqlcmd | any | Ships with SQL Server; used by the database scripts |

---

## 2. Database

Run the scripts **in numbered order** from the `database` folder. Each is
idempotent, so re-running one is safe.

```bash
cd database
for d in 01-schema 02-tables 03-constraints 04-indexes 05-views 06-procedures 07-migrations; do
  for f in "$d"/*.sql; do sqlcmd -S ".\SQLEXPRESS" -E -i "$f" -b || exit 1; done
done
```

On Windows PowerShell:

```powershell
Get-ChildItem database\0[1-7]-* -Filter *.sql -Recurse | Sort-Object FullName | ForEach-Object { sqlcmd -S ".\SQLEXPRESS" -E -i $_.FullName -b }
```

### Demo data (optional)

`08-demo` fills the portal with sample content so every screen has something to
show. **Never run it against production.** The audit-trail and error-log seeds
mark every row they write with
`CorrelationId = 00000000-0000-0000-0000-0000000000DE` so synthetic records can
always be told from genuine ones, and removed:

```sql
DELETE FROM audit.AuditLog  WHERE CorrelationId = '00000000-0000-0000-0000-0000000000DE';
DELETE FROM audit.ErrorLog  WHERE CorrelationId = '00000000-0000-0000-0000-0000000000DE';
```

---

## 3. Configuration

The distributed source contains **no credentials**. Create the local config from
the template:

```bash
cd backend/src/MCLS.Api
cp appsettings.Development.json.example appsettings.Development.json
```

Then set the three secrets. Prefer user secrets — they live outside the source
tree and cannot be committed by accident:

```bash
dotnet user-secrets init
dotnet user-secrets set "Jwt:SigningKey"          "<64 or more random characters>"
dotnet user-secrets set "Bootstrap:AdminPassword" "<a strong password>"
dotnet user-secrets set "Udyam:Token"             "<token issued by the Ministry>"
```

`Jwt:SigningKey` must be long and random: anyone who can guess it can mint a
valid token for any account. Leave `Udyam:Enabled` false if you have no token —
the portal falls back to manual entry rather than failing.

---

## 4. Build and run

```bash
cd frontend
npm ci
npm run build
```

```bash
cd backend
dotnet build
cd src/MCLS.Api
dotnet run --urls http://0.0.0.0:5199
```

The API serves the API **and** the compiled front end, so one process is enough:

- Portal — <http://localhost:5199/>
- API — <http://localhost:5199/api>
- Health — <http://localhost:5199/health>

First sign-in uses the bootstrap administrator created on start-up:

| User ID | Password |
|---|---|
| `MCLS-MIN-000001` | whatever you set in `Bootstrap:AdminPassword` |

Forgotten it? In Development only:

```bash
dotnet run -- --reset-password MCLS-MIN-000001 "<new password>"
```

---

## 5. Front-end development

To work on the UI with hot reload, run the dev server against the API:

```bash
cd frontend
npm start          # http://localhost:4200, proxying /api to :5199
```

---

## 6. Tests

```bash
cd backend
dotnet test
```

---

## 7. Notes on what is and is not wired

Some controls are drawn on the approved designs but deliberately not connected,
because doing so would need a decision the screen does not capture. Each says so
when clicked rather than failing silently:

- **Payment gateways** — Add Gateway, Configure, Test. Gateway credentials live
  in server configuration, not the database.
- **API keys** — Rotate and Generate. Both mint a secret that must be shown once
  and never again, which needs a copy-once dialog.
- **Questionnaire** — Save Question and Publish Changes validate fully but need
  a target questionnaire *version*; writing to a guess could alter a published
  standard.

The Incentives module has no seed data, so its list is legitimately empty.

## 8. Third-party services

The sign-in page and portal shell load the Government's Bhashini translation
widget from `translation-plugin.bhashini.co.in`. It is allow-listed in the API's
Content-Security-Policy (see `Program.cs`). Removing the `<script>` from
`frontend/src/index.html` disables translation; nothing else depends on it.
