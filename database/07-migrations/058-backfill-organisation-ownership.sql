/* ---------------------------------------------------------------------------
   Back-fill the ownership 057 started reading.

   057 made visibility follow the chain user -> organisation -> raising agency.
   The seeded data predates that chain and has neither end of it:

     QuadTech Advisory LLP     a Consultant Organisation raised by nobody
     NABET Assessment Services an Assessment Agency raised by nobody
     12 consultants            belonging to no firm
     6 assessors               belonging to no firm
     6 Operation Admins        belonging to no agency

   Left alone, all of that is invisible to every Implementing Agency, and the
   24 people are invisible to everyone: the filter asks for accounts inside an
   organisation the caller owns, and an account in no organisation is inside
   nobody's.

   Two of the three links are unambiguous - there is exactly one Consultant
   Organisation and exactly one Assessment Agency, so the consultants and the
   assessors have only one firm each they can belong to. The third is a choice:
   nothing in the data says which agency raised those two firms or runs those
   Operation Admins, so they go to the lead agency, the one the portal already
   sorts first. Reassigning is a single UPDATE per row and the last statement
   here prints what to change.

   Every statement only touches rows that are still null, so running it twice
   changes nothing the second time.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DECLARE @LeadAgency int =
(
    SELECT TOP 1 OrganisationId
      FROM auth.Organisation
     WHERE AccountTypeId = 1 AND IsActive = 1
     ORDER BY DisplayOrder, OrganisationId
);

IF @LeadAgency IS NULL
BEGIN
    RAISERROR('No active Implementing Agency exists to own the seeded firms.', 16, 1);
    RETURN;
END

/* ------------------------------------------- firms get their raising agency --
   Only the ones with no agency named. A firm an agency actually created
   already carries the right answer and is left alone. */
UPDATE auth.Organisation
   SET RaisedByOrganisationId = @LeadAgency
 WHERE AccountTypeId IN (6, 7)
   AND RaisedByOrganisationId IS NULL
   AND OrganisationId <> @LeadAgency;

/* --------------------------------------------- people get their own firm ----
   A consultant belongs to a Consultant Organisation and an assessor to an
   Assessment Agency. Where the scheme has exactly one of a kind there is
   nothing to decide; where it has several this leaves them alone rather than
   guessing, and the report at the end says so. */
DECLARE @ConsultantOrg int =
(
    SELECT CASE WHEN COUNT(*) = 1 THEN MIN(OrganisationId) END
      FROM auth.Organisation WHERE AccountTypeId = 6 AND IsActive = 1
);

DECLARE @AssessmentAgency int =
(
    SELECT CASE WHEN COUNT(*) = 1 THEN MIN(OrganisationId) END
      FROM auth.Organisation WHERE AccountTypeId = 7 AND IsActive = 1
);

IF @ConsultantOrg IS NOT NULL
BEGIN
    UPDATE auth.[User]
       SET OrganisationId = @ConsultantOrg
     WHERE AccountTypeId = 8 AND OrganisationId IS NULL AND IsDeleted = 0;
END

IF @AssessmentAgency IS NOT NULL
BEGIN
    UPDATE auth.[User]
       SET OrganisationId = @AssessmentAgency
     WHERE AccountTypeId = 9 AND OrganisationId IS NULL AND IsDeleted = 0;
END

/* An Operation Admin runs the portal for an Implementing Agency. */
UPDATE auth.[User]
   SET OrganisationId = @LeadAgency
 WHERE AccountTypeId = 5 AND OrganisationId IS NULL AND IsDeleted = 0;
GO

/* --------------------------------------------------------------- report ----
   What was assigned, and to whom, so a wrong guess is easy to find and undo. */
SELECT CONCAT(at.Name, ' - ', o.Name, ' is now owned by ',
              (SELECT r.Name FROM auth.Organisation r WHERE r.OrganisationId = o.RaisedByOrganisationId))
  FROM auth.Organisation o
  JOIN auth.AccountType at ON at.AccountTypeId = o.AccountTypeId
 WHERE o.AccountTypeId IN (6, 7) AND o.RaisedByOrganisationId IS NOT NULL;

SELECT CONCAT(at.Name, ' - ', COUNT(*), ' accounts now belong to ', o.Name)
  FROM auth.[User] u
  JOIN auth.AccountType at ON at.AccountTypeId = u.AccountTypeId
  JOIN auth.Organisation o ON o.OrganisationId = u.OrganisationId
 WHERE u.AccountTypeId IN (5, 8, 9) AND u.IsDeleted = 0
 GROUP BY at.Name, o.Name;

SELECT CONCAT('STILL UNOWNED - ', at.Name, ': ', COUNT(*), ' accounts with no organisation')
  FROM auth.[User] u
  JOIN auth.AccountType at ON at.AccountTypeId = u.AccountTypeId
 WHERE u.OrganisationId IS NULL AND u.IsDeleted = 0 AND u.AccountTypeId IN (5, 6, 7, 8, 9)
 GROUP BY at.Name;
GO
