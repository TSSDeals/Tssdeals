-- READ ONLY. Review the output before authoring any taxonomy migration.

-- Every glove-like equipment type and its raw deal assignment count.
SELECT et.sport_id, et.id AS equipment_type_id, et.name, et.user_created,
       COUNT(d.id) AS deal_count
FROM equipment_types et
LEFT JOIN deals d ON d.equipment_type_id = et.id
WHERE LOWER(et.id) LIKE '%glove%' OR LOWER(et.name) LIKE '%glove%'
GROUP BY et.sport_id, et.id, et.name, et.user_created
ORDER BY et.sport_id, et.name, et.id;

-- Compatibility IDs proposed for the canonical Baseball Gloves read group.
SELECT d.equipment_type_id, COUNT(*) AS deal_count
FROM deals d
WHERE d.equipment_type_id IN ('bb-gloves', 'glove', 'gloves', 'baseball-glove', 'baseball-gloves')
GROUP BY d.equipment_type_id
ORDER BY d.equipment_type_id;

-- Size-assignment completeness and normalized 11.5-inch evidence.
SELECT
  COUNT(*) FILTER (WHERE d.equipment_type_id IN ('bb-gloves', 'glove', 'gloves', 'baseball-glove', 'baseball-gloves')) AS fielding_glove_deals,
  COUNT(*) FILTER (WHERE d.size_number IS NOT NULL) AS with_stored_size,
  COUNT(*) FILTER (WHERE d.sub_filter_id IS NOT NULL) AS with_legacy_sub_filter,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM deal_sub_filters dsf WHERE dsf.deal_id = d.id
  )) AS with_joined_sub_filter,
  COUNT(*) FILTER (WHERE
    TRIM(REGEXP_REPLACE(COALESCE(d.size_number, ''), '[^0-9.]', '', 'g')) = '11.5'
    OR d.title ~* '(^|[^0-9.])11\.5[\s-]*(?:["″]|in(?:ch(?:es)?)?\.?)?(?=[^0-9.]|$)'
  ) AS normalized_11_5_evidence
FROM deals d
WHERE d.equipment_type_id IN ('bb-gloves', 'glove', 'gloves', 'baseball-glove', 'baseball-gloves');

-- Candidate fielding gloves outside the canonical group. Negative evidence stays manual-review only.
SELECT d.id, d.title, d.sport_id, d.equipment_type_id, d.size_number,
       CASE
         WHEN LOWER(d.title) ~ '(batting|golf|boxing|winter|work|garden|football|goalkeeper|hockey|lacrosse|motorcycle|cycling|ski|snow|fastpitch|slowpitch|softball).*\b(glove|mitt)'
           THEN 'manual-review: negative title evidence'
         WHEN d.sport_id IN ('fastpitch-softball', 'slowpitch-softball', 'golf', 'boxing', 'cricket')
           THEN 'manual-review: conflicting stored sport'
         ELSE 'read-path recovery candidate'
       END AS disposition
FROM deals d
WHERE d.equipment_type_id NOT IN ('bb-gloves', 'glove', 'gloves', 'baseball-glove', 'baseball-gloves')
  AND (COALESCE(d.title, '') || ' ' || COALESCE(d.brand, '')) ~*
      '(baseball\s+(fielding\s+)?glove|fielding\s+glove|infield(er)?\s+glove|outfield(er)?\s+glove|catcher(''s)?\s+mitt|first\s+base\s+mitt|wilson\s+a(2000|2k)|a2000\s+1786|heart\s+of\s+the\s+hide|pro\s+preferred)'
ORDER BY disposition, d.id;
