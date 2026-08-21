/* ---------------------------------------------------------------------------
   A document can be a hosted video instead of a file.

   The manuals and guides an applicant reads are uploaded PDFs, but the same
   shelf has to carry video walkthroughs, and those are not uploaded — they are
   hosted on YouTube or the Ministry's own channel and referenced by address.

   One column rather than a second table: a video is the same thing to everybody
   who reads this list — a titled, categorised, audience-scoped item with a live
   version — and the only difference is whether the version is a file on disk or
   an address somewhere else. A document with a VideoUrl has no file version,
   which is why CurrentVersionId has always been nullable.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('master.Document', 'VideoUrl') IS NULL
    ALTER TABLE master.Document ADD VideoUrl nvarchar(1000) NULL;
GO

/* Every document must be readable one way or the other: a file version, or an
   address. Neither is a row nobody can open. */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Document_HasContent')
    ALTER TABLE master.Document
        ADD CONSTRAINT CK_Document_HasContent
            CHECK (VideoUrl IS NOT NULL OR CurrentVersionId IS NOT NULL OR IsDeleted = 1);
GO
