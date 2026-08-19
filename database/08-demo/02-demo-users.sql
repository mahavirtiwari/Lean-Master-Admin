/*
    Demo users for the local presentation build.
    ------------------------------------------------------------------------
    Populates all nine account types so every User Management sub-menu shows a
    populated grid rather than the no-data state.

    These accounts cannot sign in. PasswordHash is left NULL and the status is
    Pending Activation for a share of them, which is exactly what a real
    freshly-created account looks like before its activation link is used — so
    the screens show a realistic mix without a single usable credential being
    committed to source control.

    Safe to re-run: it removes only the rows it created (UserCode ... '-D%').
    Never run against production.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- ------------------------------------------------------------- clean up ---
DELETE FROM auth.UserStatusHistory
WHERE UserId IN (SELECT Id FROM auth.[User] WHERE UserCode LIKE 'MCLS-D%');

DELETE FROM auth.[User] WHERE UserCode LIKE 'MCLS-D%';

-- ---------------------------------------------------------------- people ---
DECLARE @names TABLE (RowNo int IDENTITY(1,1), FullName nvarchar(150), Initials nvarchar(4));

INSERT INTO @names (FullName, Initials) VALUES
    (N'Col. Ramesh Bhat',        N'RB'), (N'Priya Sharma',          N'PS'),
    (N'Anil Deshmukh',           N'AD'), (N'Sunita Rao',            N'SR'),
    (N'Vikram Chauhan',          N'VC'), (N'Meera Nair',            N'MN'),
    (N'Rajesh Iyer',             N'RI'), (N'Kavita Singh',          N'KS'),
    (N'Arun Prakash',            N'AP'), (N'Neha Gupta',            N'NG'),
    (N'S. Venkatesan',           N'SV'), (N'Deepak Joshi',          N'DJ'),
    (N'Lakshmi Menon',           N'LM'), (N'Harpreet Kaur',         N'HK'),
    (N'Mohan Reddy',             N'MR'), (N'Ritu Agarwal',          N'RA'),
    (N'Sanjay Patil',            N'SP'), (N'Anjali Verma',          N'AV'),
    (N'Farhan Qureshi',          N'FQ'), (N'Divya Krishnan',        N'DK'),
    (N'Prakash Naidu',           N'PN'), (N'Shalini Bose',          N'SB'),
    (N'Girish Kulkarni',         N'GK'), (N'Nandita Sen',           N'NS');

-- Every (account type, role) pair the seed defines, so each sub-menu is filled
-- and the role filter on each list has something to filter by.
DECLARE @roles TABLE (RowNo int IDENTITY(1,1), RoleId int, AccountTypeId tinyint, Prefix varchar(10));

INSERT INTO @roles (RoleId, AccountTypeId, Prefix)
SELECT r.RoleId, r.AccountTypeId,
       CASE r.AccountTypeId
           WHEN 1 THEN 'IA'  WHEN 2 THEN 'MIN' WHEN 3 THEN 'ST'
           WHEN 4 THEN 'OEM' WHEN 5 THEN 'OPS' WHEN 6 THEN 'CO'
           WHEN 7 THEN 'AA'  WHEN 8 THEN 'CON' ELSE 'ASR'
       END
FROM auth.Role AS r
WHERE r.AccountTypeId IS NOT NULL
  AND r.Name <> 'Super Admin'   -- issued by the portal itself, not seeded
  AND r.IsActive = 1;

DECLARE @nameCount int = (SELECT COUNT(*) FROM @names);

-- Six accounts per role.
;WITH Slots AS
(
    SELECT
        r.RoleId,
        r.AccountTypeId,
        r.Prefix,
        s.Seq,
        ROW_NUMBER() OVER (PARTITION BY r.AccountTypeId ORDER BY r.RowNo, s.Seq) AS SeqInType,
        ROW_NUMBER() OVER (ORDER BY r.RowNo, s.Seq) AS Overall
    FROM @roles AS r
    CROSS JOIN (VALUES (1), (2), (3), (4), (5), (6)) AS s(Seq)
)
INSERT INTO auth.[User]
(
    UserName, NormalizedUserName, Email, NormalizedEmail, EmailConfirmed,
    PhoneNumberConfirmed, TwoFactorEnabled, LockoutEnabled, AccessFailedCount,
    SecurityStamp, ConcurrencyStamp,
    UserCode, FullName, Initials, Designation, PhoneNumber,
    AccountTypeId, RoleId, OrganisationId, StateId, Jurisdiction,
    StatusId, MustChangePassword, CreatedOnUtc, LastLoginOnUtc, IsDeleted
)
SELECT
    LOWER(sl.Prefix) + '.demo' + CAST(sl.Overall AS varchar(6)) + '@demo.mcls.local',
    UPPER(LOWER(sl.Prefix) + '.demo' + CAST(sl.Overall AS varchar(6)) + '@demo.mcls.local'),
    LOWER(sl.Prefix) + '.demo' + CAST(sl.Overall AS varchar(6)) + '@demo.mcls.local',
    UPPER(LOWER(sl.Prefix) + '.demo' + CAST(sl.Overall AS varchar(6)) + '@demo.mcls.local'),
    1, 0, 0, 1, 0,
    CONVERT(varchar(36), NEWID()),
    CONVERT(varchar(36), NEWID()),
    'MCLS-D' + sl.Prefix + '-' + RIGHT('000000' + CAST(sl.Overall AS varchar(6)), 6),
    n.FullName,
    n.Initials,
    CASE sl.Seq
        WHEN 1 THEN N'Joint Director'   WHEN 2 THEN N'Deputy Director'
        WHEN 3 THEN N'Assistant Director' WHEN 4 THEN N'Programme Officer'
        WHEN 5 THEN N'Coordinator'      ELSE N'Officer'
    END,
    '9' + RIGHT('000000000' + CAST(700000000 + sl.Overall AS varchar(9)), 9),
    sl.AccountTypeId,
    sl.RoleId,
    -- Only where an organisation of that account type actually exists; the
    -- column is a real FK, not a label.
    (SELECT TOP 1 o.OrganisationId
     FROM auth.Organisation AS o
     WHERE o.AccountTypeId = sl.AccountTypeId
     ORDER BY o.OrganisationId),
    CASE WHEN sl.AccountTypeId = 3
         THEN (SELECT TOP 1 st.StateId
               FROM master.State AS st
               WHERE st.IsActive = 1
               ORDER BY (st.StateId + sl.Overall) % 36, st.StateId)
    END,
    CASE sl.AccountTypeId
        WHEN 1 THEN N'National' WHEN 2 THEN N'National'
        WHEN 3 THEN N'State'    ELSE N'Regional'
    END,
    -- A realistic spread: mostly active, a few disabled, a few never activated.
    CASE
        WHEN sl.Overall % 11 = 0 THEN 2   -- Inactive / disabled
        WHEN sl.Overall % 7  = 0 THEN 3   -- Pending activation
        ELSE 1                            -- Active
    END,
    0,
    DATEADD(DAY, -(sl.Overall % 300), SYSUTCDATETIME()),
    CASE WHEN sl.Overall % 7 <> 0
         THEN DATEADD(HOUR, -(sl.Overall % 400), SYSUTCDATETIME())
    END,
    0
FROM Slots AS sl
INNER JOIN @names AS n ON n.RowNo = ((sl.Overall - 1) % @nameCount) + 1;

COMMIT TRANSACTION;

-- ------------------------------------------------------------- summary ---
SELECT
    at.Name                                                   AS AccountType,
    COUNT(*)                                                  AS Users,
    SUM(CASE WHEN u.StatusId = 1 THEN 1 ELSE 0 END)           AS Active,
    SUM(CASE WHEN u.StatusId = 2 THEN 1 ELSE 0 END)           AS Disabled,
    SUM(CASE WHEN u.StatusId = 3 THEN 1 ELSE 0 END)           AS Pending
FROM auth.[User] AS u
INNER JOIN auth.AccountType AS at ON at.AccountTypeId = u.AccountTypeId
WHERE u.IsDeleted = 0
GROUP BY at.Name, at.SortOrder
ORDER BY at.SortOrder;
