/* ---------------------------------------------------------------------------
   The key the LMS calls back with.

   The courses and the examination run on the LMS, not in this portal, so the
   LMS is the only thing that knows a participant's progress and whether they
   passed. It reports both to /api/lms/bronze/*, which is machine-to-machine —
   there is no applicant session behind those calls — so the requests carry a
   shared key instead.

   A random key is generated here rather than shipping a known default: an
   endpoint that writes exam results must not be callable by anyone who has read
   the source. Rotate it under Settings and hand the new value to the LMS.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM audit.SystemSetting WHERE [Key] = 'Bronze.LmsApiKey')
BEGIN
    INSERT audit.SystemSetting ([Key], Value, DataType, Category, DisplayName, Description,
                                IsSensitive, IsEditable, SortOrder)
    VALUES ('Bronze.LmsApiKey',
            REPLACE(CONVERT(varchar(36), NEWID()), '-', '') + REPLACE(CONVERT(varchar(36), NEWID()), '-', ''),
            'string', N'Bronze', N'LEAN Bronze LMS callback key',
            N'Shared secret the LMS sends as X-LMS-Key when reporting course progress and examination results.',
            1, 1, 11);
END
GO
