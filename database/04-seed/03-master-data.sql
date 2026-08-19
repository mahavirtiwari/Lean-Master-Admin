/*===========================================================================
  Seed 3 — geography, NIC sectors, LEAN parameters, technology master and the
  generic lookup lists.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*--------------------------------------------------------------------- State
  IsNorthEastern drives the NER subsidy slab, so it is a column rather than a
  list held in application code. Sikkim is included: it is part of the North
  Eastern Council and qualifies for NER benefits under the scheme.
---------------------------------------------------------------------------*/
MERGE master.State AS tgt
USING (VALUES
    ('AN', N'Andaman and Nicobar Islands', 1, 0),
    ('AP', N'Andhra Pradesh',              0, 0),
    ('AR', N'Arunachal Pradesh',           0, 1),
    ('AS', N'Assam',                       0, 1),
    ('BR', N'Bihar',                       0, 0),
    ('CH', N'Chandigarh',                  1, 0),
    ('CT', N'Chhattisgarh',                0, 0),
    ('DH', N'Dadra and Nagar Haveli and Daman and Diu', 1, 0),
    ('DL', N'Delhi',                       1, 0),
    ('GA', N'Goa',                         0, 0),
    ('GJ', N'Gujarat',                     0, 0),
    ('HR', N'Haryana',                     0, 0),
    ('HP', N'Himachal Pradesh',            0, 0),
    ('JK', N'Jammu and Kashmir',           1, 0),
    ('JH', N'Jharkhand',                   0, 0),
    ('KA', N'Karnataka',                   0, 0),
    ('KL', N'Kerala',                      0, 0),
    ('LA', N'Ladakh',                      1, 0),
    ('LD', N'Lakshadweep',                 1, 0),
    ('MP', N'Madhya Pradesh',              0, 0),
    ('MH', N'Maharashtra',                 0, 0),
    ('MN', N'Manipur',                     0, 1),
    ('ML', N'Meghalaya',                   0, 1),
    ('MZ', N'Mizoram',                     0, 1),
    ('NL', N'Nagaland',                    0, 1),
    ('OD', N'Odisha',                      0, 0),
    ('PY', N'Puducherry',                  1, 0),
    ('PB', N'Punjab',                      0, 0),
    ('RJ', N'Rajasthan',                   0, 0),
    ('SK', N'Sikkim',                      0, 1),
    ('TN', N'Tamil Nadu',                  0, 0),
    ('TG', N'Telangana',                   0, 0),
    ('TR', N'Tripura',                     0, 1),
    ('UP', N'Uttar Pradesh',               0, 0),
    ('UK', N'Uttarakhand',                 0, 0),
    ('WB', N'West Bengal',                 0, 0)
) AS src (Code, Name, IsUnionTerritory, IsNorthEastern)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    Name = src.Name, IsUnionTerritory = src.IsUnionTerritory, IsNorthEastern = src.IsNorthEastern
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, IsUnionTerritory, IsNorthEastern)
    VALUES (src.Code, src.Name, src.IsUnionTerritory, src.IsNorthEastern);
GO

/*------------------------------------------------------------------ District
  A working subset covering the states the portal's seeded organisations and
  sample enterprises sit in. The full ~780-district list is loaded separately
  from the LGD extract in 04-seed/optional/districts-full.sql.
---------------------------------------------------------------------------*/
MERGE master.District AS tgt
USING (
    SELECT s.StateId, d.Name
    FROM (VALUES
        ('DL', N'New Delhi'),        ('DL', N'Central Delhi'),      ('DL', N'South Delhi'),
        ('MH', N'Mumbai City'),      ('MH', N'Mumbai Suburban'),    ('MH', N'Pune'),
        ('MH', N'Nashik'),           ('MH', N'Nagpur'),             ('MH', N'Aurangabad'),
        ('GJ', N'Ahmedabad'),        ('GJ', N'Surat'),              ('GJ', N'Vadodara'),
        ('GJ', N'Rajkot'),           ('GJ', N'Gandhinagar'),
        ('TN', N'Chennai'),          ('TN', N'Coimbatore'),         ('TN', N'Tiruppur'),
        ('TN', N'Madurai'),          ('TN', N'Salem'),
        ('KA', N'Bengaluru Urban'),  ('KA', N'Mysuru'),             ('KA', N'Belagavi'),
        ('UP', N'Kanpur Nagar'),     ('UP', N'Lucknow'),            ('UP', N'Noida'),
        ('UP', N'Ghaziabad'),        ('UP', N'Agra'),
        ('PB', N'Ludhiana'),         ('PB', N'Amritsar'),           ('PB', N'Jalandhar'),
        ('RJ', N'Jaipur'),           ('RJ', N'Jodhpur'),            ('RJ', N'Udaipur'),
        ('WB', N'Kolkata'),          ('WB', N'Howrah'),             ('WB', N'Durgapur'),
        ('TG', N'Hyderabad'),        ('TG', N'Rangareddy'),
        ('HR', N'Gurugram'),         ('HR', N'Faridabad'),          ('HR', N'Panipat'),
        ('MP', N'Indore'),           ('MP', N'Bhopal'),
        ('AS', N'Kamrup Metropolitan'), ('AS', N'Dibrugarh'),
        ('KL', N'Ernakulam'),        ('KL', N'Thiruvananthapuram'),
        ('OD', N'Khordha'),          ('OD', N'Cuttack'),
        ('AP', N'Visakhapatnam'),    ('AP', N'Guntur')
    ) AS d(StateCode, Name)
    JOIN master.State s ON s.Code = d.StateCode
) AS src
   ON tgt.StateId = src.StateId AND tgt.Name = src.Name
WHEN NOT MATCHED BY TARGET THEN
    INSERT (StateId, Name) VALUES (src.StateId, src.Name);
GO

/*-------------------------------------------------------------------- Sector
  NIC-2008 two-digit divisions for manufacturing, which is the scheme's scope.
---------------------------------------------------------------------------*/
MERGE master.Sector AS tgt
USING (VALUES
    ('10', N'Manufacture of food products'),
    ('11', N'Manufacture of beverages'),
    ('12', N'Manufacture of tobacco products'),
    ('13', N'Manufacture of textiles'),
    ('14', N'Manufacture of wearing apparel'),
    ('15', N'Manufacture of leather and related products'),
    ('16', N'Manufacture of wood and products of wood and cork'),
    ('17', N'Manufacture of paper and paper products'),
    ('18', N'Printing and reproduction of recorded media'),
    ('19', N'Manufacture of coke and refined petroleum products'),
    ('20', N'Manufacture of chemicals and chemical products'),
    ('21', N'Manufacture of pharmaceuticals and botanical products'),
    ('22', N'Manufacture of rubber and plastics products'),
    ('23', N'Manufacture of other non-metallic mineral products'),
    ('24', N'Manufacture of basic metals'),
    ('25', N'Manufacture of fabricated metal products'),
    ('26', N'Manufacture of computer, electronic and optical products'),
    ('27', N'Manufacture of electrical equipment'),
    ('28', N'Manufacture of machinery and equipment n.e.c.'),
    ('29', N'Manufacture of motor vehicles, trailers and semi-trailers'),
    ('30', N'Manufacture of other transport equipment'),
    ('31', N'Manufacture of furniture'),
    ('32', N'Other manufacturing')
) AS src (NicCode, Name)
   ON tgt.NicCode = src.NicCode
WHEN MATCHED AND tgt.Name <> src.Name THEN UPDATE SET Name = src.Name
WHEN NOT MATCHED BY TARGET THEN INSERT (NicCode, Name) VALUES (src.NicCode, src.Name);
GO

/* Tobacco is inactive in the portal's own sector list — the scheme does not
   extend to it. Applied as an update so a later policy change is one edit. */
UPDATE master.Sector SET IsActive = 0 WHERE NicCode = '12' AND IsActive = 1;
GO

/*----------------------------------------------------------------- Parameter
  The ten LEAN parameters. SMED is seeded inactive, matching the portal.
---------------------------------------------------------------------------*/
MERGE master.Parameter AS tgt
USING (VALUES
    ('LP-01', N'5S — Workplace Organisation',       N'Sort, set in order, shine, standardise and sustain across all work areas',  1, 1),
    ('LP-02', N'Visual Management',                 N'Visual controls, andon, signage and floor marking on the shop floor',       2, 1),
    ('LP-03', N'Waste Elimination (7 Wastes)',      N'Identification and removal of the seven wastes of manufacturing',           3, 1),
    ('LP-04', N'Standard Operating Procedures',     N'Documented and displayed SOPs at every workstation',                        4, 1),
    ('LP-05', N'Kaizen — Continuous Improvement',   N'Structured improvement events with recorded before and after gains',        5, 1),
    ('LP-06', N'Poka Yoke — Mistake Proofing',      N'Error-proofing devices and checks at critical process steps',               6, 1),
    ('LP-07', N'Total Productive Maintenance',      N'Autonomous and planned maintenance with OEE tracking',                      7, 1),
    ('LP-08', N'Value Stream Mapping',              N'Current and future state maps with identified improvement loops',           8, 1),
    ('LP-09', N'Kanban & Pull System',              N'Pull-based replenishment with defined bin and card quantities',             9, 1),
    ('LP-10', N'Quick Changeover (SMED)',           N'Reduction of internal setup time through changeover analysis',             10, 0)
) AS src (Code, Name, Description, SortOrder, IsActive)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    Name = src.Name, Description = src.Description, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Description, SortOrder, IsActive)
    VALUES (src.Code, src.Name, src.Description, src.SortOrder, src.IsActive);
GO

/*-------------------------------------------------------- TechnologyCategory */
MERGE master.TechnologyCategory AS tgt
USING (VALUES
    (N'Automation & Robotics',   1),
    (N'Digital & IoT',           2),
    (N'Energy Efficiency',       3),
    (N'Quality & Metrology',     4),
    (N'Material Handling',       5),
    (N'Additive Manufacturing',  6),
    (N'Waste & Effluent',        7)
) AS src (Name, SortOrder)
   ON tgt.Name = src.Name
WHEN NOT MATCHED BY TARGET THEN INSERT (Name, SortOrder) VALUES (src.Name, src.SortOrder);
GO

/*---------------------------------------------------------------- Technology
  A NULL SectorId means "All Sectors" — the technology is offered everywhere.
---------------------------------------------------------------------------*/
MERGE master.Technology AS tgt
USING (
    SELECT v.Code, v.Name, v.Description, tc.TechnologyCategoryId, s.SectorId, v.IsActive
    FROM (VALUES
        ('TU-01', N'Industrial IoT Retrofit Kit',   N'Sensor retrofit for live machine monitoring',      N'Digital & IoT',          NULL, 1),
        ('TU-02', N'Robotic Pick & Place Cell',     N'Six-axis robotic cell for material transfer',      N'Automation & Robotics',  '29', 1),
        ('TU-03', N'Servo Energy Recovery Drive',   N'Regenerative drives on press machines',            N'Energy Efficiency',      '24', 1),
        ('TU-04', N'Inline Vision Inspection',      N'Camera inspection replacing manual gauging',       N'Quality & Metrology',    '26', 1),
        ('TU-05', N'AGV Material Transfer',         N'Guided vehicles moving WIP between cells',         N'Material Handling',      '29', 1),
        ('TU-06', N'Metal 3D Printing Cell',        N'Additive cell for tooling and spare parts',        N'Additive Manufacturing', '28', 1),
        ('TU-07', N'Zero Liquid Discharge Unit',    N'Effluent recovery returning treated water',        N'Waste & Effluent',       '20', 1),
        ('TU-08', N'Predictive Maintenance Suite',  N'Vibration analytics predicting failure',           N'Digital & IoT',          NULL, 1),
        ('TU-09', N'Solar Rooftop Integration',     N'Rooftop PV offsetting daytime shop load',          N'Energy Efficiency',      NULL, 1),
        ('TU-10', N'Ultrasonic Cleaning Line',      N'Ultrasonic degreasing replacing solvents',         N'Waste & Effluent',       '13', 0)
    ) AS v (Code, Name, Description, CategoryName, SectorNic, IsActive)
    JOIN master.TechnologyCategory tc ON tc.Name = v.CategoryName
    LEFT JOIN master.Sector        s  ON s.NicCode = v.SectorNic
) AS src
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    Name = src.Name, Description = src.Description,
    TechnologyCategoryId = src.TechnologyCategoryId, SectorId = src.SectorId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Description, TechnologyCategoryId, SectorId, IsActive)
    VALUES (src.Code, src.Name, src.Description, src.TechnologyCategoryId, src.SectorId, src.IsActive);
GO

/*----------------------------------------------------------- Lookup lists
  The dropdowns that are admin-editable but too small to deserve a table.
---------------------------------------------------------------------------*/
MERGE master.LookupType AS tgt
USING (VALUES
    ('AGENCY_CATEGORY',   N'Agency Category',      1),
    ('DOCUMENT_CATEGORY', N'Document Category',    1),
    ('KPI_UNIT',          N'KPI Unit',             1),
    ('EVIDENCE_TYPE',     N'Evidence Type',        0),
    ('DESIGNATION',       N'Designation',          0)
) AS src (Code, Name, IsSystem)
   ON tgt.Code = src.Code
WHEN NOT MATCHED BY TARGET THEN INSERT (Code, Name, IsSystem) VALUES (src.Code, src.Name, src.IsSystem);
GO

MERGE master.LookupValue AS tgt
USING (
    SELECT lt.LookupTypeId, v.Code, v.Name, v.SortOrder
    FROM (VALUES
        ('AGENCY_CATEGORY', 'CENTRAL',      N'Central Implementing Agency',       1),
        ('AGENCY_CATEGORY', 'STATE',        N'State Implementing Agency',         2),
        ('AGENCY_CATEGORY', 'SECTORAL',     N'Sectoral Implementing Agency',      3),
        ('AGENCY_CATEGORY', 'INDUSTRY',     N'Industry Association',              4),

        ('DOCUMENT_CATEGORY','TRAINING',    N'Training Material',                 1),
        ('DOCUMENT_CATEGORY','GUIDELINE',   N'Guidelines',                        2),
        ('DOCUMENT_CATEGORY','SOP',         N'Standard Operating Procedure',      3),
        ('DOCUMENT_CATEGORY','FORM',        N'Forms and Templates',               4),
        ('DOCUMENT_CATEGORY','RUBRIC',      N'Evaluation Rubric',                 5),

        ('KPI_UNIT',        'PCT',          N'%',                                 1),
        ('KPI_UNIT',        'NOS',          N'Nos.',                              2),
        ('KPI_UNIT',        'HRS',          N'Hrs',                               3),
        ('KPI_UNIT',        'DAYS',         N'Days',                              4),
        ('KPI_UNIT',        'INR',          N'₹',                                 5),
        ('KPI_UNIT',        'KWH',          N'kWh',                               6),

        ('EVIDENCE_TYPE',   'PHOTO',        N'Photograph',                        1),
        ('EVIDENCE_TYPE',   'REGISTER',     N'Register / Log',                    2),
        ('EVIDENCE_TYPE',   'DRAWING',      N'Layout Drawing',                    3),
        ('EVIDENCE_TYPE',   'REPORT',       N'Report / Extract',                  4),
        ('EVIDENCE_TYPE',   'CALENDAR',     N'Calendar / Audit Sheet',            5)
    ) AS v (TypeCode, Code, Name, SortOrder)
    JOIN master.LookupType lt ON lt.Code = v.TypeCode
) AS src
   ON tgt.LookupTypeId = src.LookupTypeId AND tgt.Code = src.Code
WHEN MATCHED AND tgt.Name <> src.Name THEN UPDATE SET Name = src.Name
WHEN NOT MATCHED BY TARGET THEN
    INSERT (LookupTypeId, Code, Name, SortOrder)
    VALUES (src.LookupTypeId, src.Code, src.Name, src.SortOrder);
GO

PRINT N'Seed 3 — master data loaded.';
GO
