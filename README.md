# MCLS Portal — Master Administration

Super Admin portal for the **MSME Competitive (LEAN) Scheme**, built to the SVG
designs in `E:\Lean\14-inch-1512` (97 screens).

| Layer     | Technology                          | Location    |
| --------- | ----------------------------------- | ----------- |
| Database  | SQL Server 2022 Express (`.\SQLEXPRESS`, db `MCLS`) | `database/` |
| Backend   | .NET 10 Web API, EF Core, JWT       | `backend/`  |
| Frontend  | Angular 22.1 (standalone, signals, zoneless) | `frontend/` |

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

Already deployed to `.\SQLEXPRESS` as `MCLS` — 67 tables, 11 views, 15 stored
procedures, 75 permissions, 15 modules, 45 menu rows, 9 account types.

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

- **ACCESS** — which of the 15 modules a role may open.
- **MANAGE** — which of those it may act on. Openable but not manageable means
  view + export only.

15 modules × 5 rights = **75 permissions**. The API refuses to start if that
count is wrong, because every authorization check would otherwise fail closed.

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

## Screen coverage

Built and verified against the SVG exports:

| Module | Artboards covered |
| ------ | ----------------- |
| Sign-in | `0`, `0a` |
| Dashboard | `1`, `1-no-data` |
| **User Management** | `2`, `2-no-data`, `2-edit-permissions`, `2a`, `2b`, `3`, `4`, `4-no-data`, `18`-`25` and their no-data variants, `41`-`65` |
| Sectors | `66`, `66-no-data`, `68`, `69`, `70` |
| Parameters | `67`, `67-no-data`, `71`, `72`, `73` |
| Technology Upgradation | `74`, `74-no-data`, `75` |
| Fee Structure | `14`, `26`, `27`, `28`, `82` |
| Settings | `33`, `34`, `35`, `36` |

Not yet built as Angular screens. Their APIs exist and are verified, so these are
front-end work following the same pattern as Sectors and User Management:
**Handholding** (`11`, `15`, `16`), **Assessments** (`17`), **Questionnaire
Silver/Gold** (`5`, `6`, `7`), **Incentives** (`12`, `13`, `29`-`32`, `37`-`40`),
**Upload Documents** (`9`, `9-no-data`, `10`, `76`, `77`, `78`), **Reports**
(`8`), **Emailer** (`79`, `79-no-data`, `80`, `81`).

---


## Design fidelity

Colours, type sizes, radii and the 260/76 px sidebar geometry in
`frontend\src\styles\_tokens.scss` are transcribed from the SVG exports, not
approximated — including the fractional type sizes (11.2, 12.5, 18.5), because
rounding them visibly changes table density.

Each SVG contains two artboards, `view-expanded` and `view-collapsed`, for the
two sidebar states. Both are implemented; the collapse toggle is the button left
of the breadcrumb.
