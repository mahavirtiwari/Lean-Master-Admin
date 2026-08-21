# Deployment — lean.umon.in

The portal runs on a Windows Server behind IIS: the Angular build is the site,
the API is a child application at `/api`, and the database is the shared SQL
Server instance on the same host.

Serving both from one site is deliberate — the browser calls `/api` on its own
origin, so there is no CORS pre-flight on any request and no second host name
to keep a certificate for.

```
  https://lean.umon.in/            C:\MCLS\site      Angular build
  https://lean.umon.in/api         C:\MCLS\api       .NET API (in-process)
                                   C:\MCLS\Uploads   uploaded documents
                                   C:\MCLS\Logs      rolling API log
  MCLS database                    20.219.21.200,1433 (zeddev\SQLEXPRESS)
```

---

## Server facts

Established by probing the host, not assumed:

| | |
|---|---|
| Host | `20.219.21.200`, DNS for `lean.umon.in` already resolves here |
| OS / web | Windows Server, IIS 10 — currently the default IIS welcome page |
| Open to the internet | 80, 443, 3389 (RDP), 1433 (SQL) |
| Closed | 22 (SSH), 5985/5986 (WinRM), 445, 8172 (Web Deploy) |
| SQL | SQL Server 2025, instance `zeddev\SQLEXPRESS`, shared with live ZED databases |

**There is no remote management path to this box.** RDP is a screen, not an API,
so the application tier cannot be deployed remotely until SSH or WinRM is opened.
That is what `Deploy-Lean.ps1` is for, and why it installs OpenSSH at the end.

---

## Database — already done

The `MCLS` database was brought to the current schema on 21 August 2026,
remotely over port 1433. It went from a 17 August shell (66 tables, no business
data) to 79 tables with all 38 migrations applied — matching the development
database exactly, except for `dbo.sysdiagrams`, which is an SSMS artefact.

`05-security` and `06-maintenance` were **not** run, and the deployment script
skips them too. The first creates server-level logins with placeholder
passwords, the second SQL Agent jobs. Neither belongs on an instance that also
hosts `ZEDCS_V2_LIVE` and the other production databases.

`08-demo` was not run either. The dashboard will be empty until real
registrations arrive. To fill it for a demonstration:

```powershell
sqlcmd -S 20.219.21.200,1433 -U dbadmin -P '<password>' -d MCLS -C -b -I -i database\08-demo\01-demo-data.sql
```

Every row it writes is marked `CorrelationId = 00000000-0000-0000-0000-0000000000DE`
so it can be told apart from genuine data, and removed.

---

## Application — one script, run over RDP

Sign in to `20.219.21.200` as `azureuser`, open PowerShell **as Administrator**,
and run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
Invoke-WebRequest -UseBasicParsing -OutFile $env:TEMP\Deploy-Lean.ps1 `
  https://raw.githubusercontent.com/mahavirtiwari/Lean-Master-Admin/main/deploy/Deploy-Lean.ps1
& $env:TEMP\Deploy-Lean.ps1 -Domain lean.umon.in -AdminEmail <your address> -DbPassword '<the dbadmin password>'
```

It takes roughly 15–25 minutes on a first run, most of it downloading the .NET
SDK and Node. What it does:

1. Installs what is missing — IIS features, the ASP.NET Core Hosting Bundle,
   URL Rewrite, the .NET 10 SDK, Node.js, Git.
2. Clones this repository to `C:\MCLS\src`.
3. Applies the database scripts (a no-op now, but the path every later release
   takes).
4. Builds the front end and publishes the API.
5. Lays both out under `C:\MCLS`.
6. Writes `appsettings.Production.json` — the domain, and a JWT signing key
   generated on the server so no secret is ever committed or typed.
7. Creates the IIS site and the `/api` application, and stops the Default Web
   Site, which would otherwise shadow it on port 80.
8. Restricts that settings file to administrators and the application pool.
9. Requests a Let's Encrypt certificate through win-acme, with renewal
   scheduled.
10. Installs OpenSSH and opens the Windows firewall for it.

It is idempotent. **Run it again for every later release** — it pulls the
branch, rebuilds, and leaves the database and the generated secrets alone.

### After the first run

- **Open TCP 22 on the VM's network security group**, restricted to the
  addresses that should be allowed to deploy. The script opens the Windows
  firewall but cannot touch Azure's. Until this is done, releases still need a
  remote desktop session.
- **Rotate the two passwords that have been shared in plain text** — the
  `azureuser` login and the `dbadmin` SQL login — and move the server to
  key-based SSH.

---

## Sign-in

The database already carries a `Super Admin` account. Its password is not the
development one; whoever created it on 17 August has it. To set a known
password, sign in as any administrator and change it, or reset it directly:

```powershell
# From the source checkout, with the API running:
#   POST /api/users/{id}/reset-password
```

---

## Verifying a release

```powershell
Invoke-WebRequest https://lean.umon.in/api/health/ready -UseBasicParsing   # 200 and "Healthy"
Invoke-WebRequest https://lean.umon.in/ -UseBasicParsing                   # contains <app-root>
Get-Content C:\MCLS\Logs\mcls-api-*.log -Tail 40
```

If the site returns **500.19**, URL Rewrite or the Hosting Bundle did not
install — the script checks for both and stops, but a manual install may have
been interrupted. If it returns **500.30**, the API failed to start: the reason
is in `C:\MCLS\Logs` and in the Windows Application event log.

---

## Known constraint

The instance is SQL Server **Express**, which is capped at 10 GB per database.
That is ample for a pilot and nowhere near the 50 lakh registrations the scheme
plans for. Moving to Standard, or to Azure SQL, is a procurement decision that
needs taking before the volume arrives — no code change is involved.
