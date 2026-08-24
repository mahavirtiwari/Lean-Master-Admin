# MCLS Portal — MSME Competitive (LEAN) Scheme

The platform for the **MSME Competitive (LEAN) Scheme**, built to the supplied
SVG artboards. It has three faces over one API and one database:

- **Master Administration** — the Super Admin / Ministry web portal.
- **Applicant web** — enterprise registration and the post-registration journey
  (Silver data is read-only on web; captured on mobile).
- **Applicant mobile app** — the React Native / Expo app the enterprise uses to
  register and complete its application.

| Layer    | Technology                                          | Location    |
| -------- | --------------------------------------------------- | ----------- |
| Database | SQL Server 2022 Express (`.\SQLEXPRESS`, db `MCLS`) | `database/` |
| Backend  | .NET 10 Web API, EF Core, JWT                       | `backend/`  |
| Frontend | Angular 22 (standalone, signals, zoneless)          | `frontend/` |
| Mobile   | React Native / Expo SDK 57 (TypeScript)             | `mobile/`   |
| Deploy   | Windows/IIS deploy script + guide                   | `deploy/`   |

**Production:** https://lean.umon.in — see [`deploy/README.md`](deploy/README.md).

---

## Run it

```powershell
E:\Lean\LeanPortal\scripts\start-portal.ps1
```

Then open **http://localhost:5199**

| Field    | Value                                      |
| -------- | ------------------------------------------ |
| User ID  | `MCLS-MIN-000001`                          |
| Password | whatever you set in `Bootstrap:AdminPassword` |

The sign-in screen also asks for the 5-character security code shown beside the
field.

**One process, one port.** The API serves the built Angular app as well as the
JSON endpoints, so there is no dev server to keep running alongside it and no
proxy to misconfigure. Swagger is at `/swagger`.

The script opens the API in its own PowerShell window. Leave that window open --
closing it stops the portal.

### While changing front-end code

```powershell
E:\Lean\LeanPortal\scripts\start-portal.ps1 -Dev
```

That adds the Angular dev server on **http://localhost:4200** with hot reload,
proxying API calls to :5199. Use :5199 for a demo and :4200 while developing.

### Starting the two halves by hand

```powershell
cd E:\Lean\LeanPortal\backend\src\MCLS.Api; dotnet run --urls http://0.0.0.0:5199
```

```powershell
cd E:\Lean\LeanPortal\frontend; npm start
```

### If the page does not load

- **Nothing is listening.** The portal only runs while its window is open. Run
  the start script again.
- **Blank page after an update.** The browser cached the old bundle. Hard-refresh
  with `Ctrl+F5`.
- The dev server binds `0.0.0.0`, so both `localhost` and `127.0.0.1` work. That
  is deliberate -- binding IPv6-only made `127.0.0.1:4200` refuse connections
  while `localhost:4200` worked, depending on how the machine resolved the name.

### Mobile app (`mobile/`)

```powershell
cd E:\Lean\LeanPortal\mobile; npx expo start
```

Point it at an API with `EXPO_PUBLIC_API_BASE_URL`, or set `extra.apiBaseUrl` in
`app.json` (production defaults to `https://lean.umon.in`). A signed testing APK
is produced with `npx expo prebuild -p android` then
`android\gradlew.bat assembleRelease` (needs JDK 17 + the Android SDK). The
generated `android/` and `ios/` folders are gitignored.

---

## Deployment

The Windows/IIS deploy is scripted and idempotent:

```powershell
E:\Lean\LeanPortal\deploy\Deploy-Lean.ps1
```

It is **single-process hosting** — the API serves the built Angular app; there is
no separate static site or `/api` child application. Full steps, prerequisites
and the Udyam token switch are in [`deploy/README.md`](deploy/README.md).

---


## Opening in Visual Studio 2026

Open `backend\MCLS.sln`. Four projects plus tests:

```
MCLS.Domain          entities and enums, no dependencies
MCLS.Application     interfaces and result types
MCLS.Infrastructure  EF Core, JWT, e-mail, file storage
MCLS.Api             controllers, authorization, middleware
MCLS.UnitTests       permission-matrix tests
```

`F5` runs the API on https://localhost:7199 / http://localhost:5199. The Angular
proxy targets the HTTP port, so use the `http` profile when running the portal
alongside it.

---

## Database

Already deployed to `.\SQLEXPRESS` as `MCLS` — 88 tables, 11 views, 15 stored
procedures, 85 permissions, 17 modules, 55 menu rows, 12 account types.
Schema changes since the baseline live in `database/07-migrations/` (numbered
`001`–`041`), applied in order and idempotent.

To rebuild from scratch on another machine:

```powershell
cd E:\Lean\LeanPortal\database; .\deploy-database.ps1 -ServerInstance .\SQLEXPRESS
```

Scripts run in numbered-folder order and are idempotent.

### Demo data

Two scripts, neither part of `deploy-database.ps1` -- run them explicitly:

```powershell
sqlcmd -S .\SQLEXPRESS -d MCLS -E -C -I -i E:\Lean\LeanPortal\database\08-demo\01-demo-data.sql
```

```powershell
sqlcmd -S .\SQLEXPRESS -d MCLS -E -C -I -i E:\Lean\LeanPortal\database\08-demo\02-demo-users.sql
```

`01` creates 420 enterprises and 420 applications across all ten pipeline stages
and all three certification levels, so the Dashboard has figures to show.

`02` creates 78 users across all nine account types, with a realistic mix of
Active, Disabled and Pending Activation, so every User Management sub-menu shows
a populated grid. **These accounts cannot sign in** -- `PasswordHash` is left
NULL, which is exactly what a real account looks like before its activation link
is used, so no usable credential is committed to source control.

Both replace only their own rows on re-run (everything they create is tagged
`DEMO-`, `MCLS-APP-` or `MCLS-D...`).


### Migration applied

`07-migrations\002-application-certificate-unique.sql` replaces
`UQ_Application_Certificate` with a filtered unique index. As a plain UNIQUE
constraint it allowed only one NULL, so the database could hold exactly one
uncertified application — the second registration failed. See the header comment
in that file.

---

## Authorization model

Two matrices, both seeded in `database\04-seed\02-roles-and-permissions.sql`:

- **ACCESS** — which of the 17 modules a role may open.
- **MANAGE** — which of those it may act on. Openable but not manageable means
  view + export only.

17 modules × 5 rights = **85 permissions**. The API refuses to start if that
count is wrong (the expected count is derived from modules × rights, not
hard-coded), because every authorization check would otherwise fail closed.

The two newest modules — **ESG Checklist** and **Basic Info & Documents** — were
added in migration `039`; they configure what the applicant's LEAN Silver
application collects.

The sidebar is built from the menu the API returns for the signed-in user, not
from a hard-coded list — a role that cannot open Assessments is never sent that
branch.

Super Admin is a *role inside Ministry of MSME*, not a tenth account type.

### Resetting a forgotten local password

```powershell
cd E:\Lean\LeanPortal\backend\src\MCLS.Api; dotnet run -- --reset-password MCLS-MIN-000001 "New@Password#2026"
```

Development only. Goes through Identity's own hasher and password validator, so
`auth.[User].PasswordHash` is never hand-edited.

---

## Local demo credentials

`Jwt:SigningKey` and the bootstrap admin password sit in
`backend\src\MCLS.Api\appsettings.Development.json` so the portal runs with no
setup. **Before any real deployment**, delete both and supply them through user
secrets or environment variables — `appsettings.json` (Production) deliberately
leaves them empty and the API will refuse to start without them.

---

## Modules

### Admin web (`frontend/`)

All admin modules are built and wired to the API:

- **Dashboard** — pipeline figures, India choropleth, exportable sections.
- **User Management** — the nine agency sub-menus, create/edit, permissions.
- **Sectors**, **Parameters**, **Technology Upgradation** — master lists, each
  with CSV export; Technology also has CSV import (template + upload).
- **Questionnaire** (Silver/Gold) — question bank with export.
- **ESG Checklist**, **Basic Info & Documents** — configure the applicant's
  LEAN Silver application (sections, Yes/No/NA questions with dependents;
  basic-information items and required document list).
- **Fee Structure**, **Incentives**, **Handholding**, **Assessments**,
  **Documents / Upload Documents**, **Reports**, **Emailer**, **Settings**.

### Applicant web (`frontend/`, routes under `/register` and `/msme/*`)

Public registration (`/register`) and the applicant portal (`/msme/login`,
`/msme/dashboard`, `/msme/application`, `/msme/payment`, `/msme/reset-password`).
Payment can be made on web; from payment through consultant selection the LEAN
Silver journey is mobile-only, and that captured data is **read-only on web**.
Bronze works fully on both web and mobile.

### Applicant mobile (`mobile/`)

The React Native / Expo app built to the A-series (auth) and R-series
(registration) artboards: splash, sign-in, reset password, and the seven-step
registration wizard, plus the signed-in home, certifications, incentives,
payment, documents, profile and the LEAN Silver application. Config in
`mobile/app.json` (`extra.apiBaseUrl` → the API).

---


## Design fidelity

Colours, type sizes, radii and the 260/76 px sidebar geometry in
`frontend\src\styles\_tokens.scss` are transcribed from the SVG exports, not
approximated — including the fractional type sizes (11.2, 12.5, 18.5), because
rounding them visibly changes table density.

Each SVG contains two artboards, `view-expanded` and `view-collapsed`, for the
two sidebar states. Both are implemented; the collapse toggle is the button left
of the breadcrumb.
