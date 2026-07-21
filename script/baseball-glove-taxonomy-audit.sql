-- READ ONLY. Review the output before authoring any taxonomy migration.

-- Every glove-like equipment type and its raw deal assignment count.
SELECT et.sport_id, et.id AS equipment_type_id, et.name, et.user_created,
       COUNT(d.id) AS deal_count
FROM equipment_types et
LEFT JOIN deals d ON d.equipment_type_id = et.id
WHERE LOWER(et.id) LIKE '%glove%' OR LOWER(et.name) LIKE '%glove%'
GROUP BY et.sport_id, et.id, et.name, et.user_created
ORDER BY et.sport_id, et.name, et.id;

-- IDs whose raw label can render as a duplicate "Gloves" result heading.
-- Only baseball-scoped legacy fielding IDs project to bb-gloves; softball/golf remain separate.
SELECT et.sport_id, et.id AS stored_equipment_type_id, et.name AS raw_display_label,
       COUNT(d.id) AS deal_count,
       CASE
         WHEN et.sport_id = 'baseball'
          AND et.id IN ('bb-gloves', 'glove', 'gloves', 'baseball-glove', 'baseball-gloves')
           THEN 'bb-gloves / Baseball Gloves'
         ELSE 'preserve separate taxonomy'
       END AS projected_result_group
FROM equipment_types et
LEFT JOIN deals d ON d.equipment_type_id = et.id
WHERE LOWER(et.name) IN ('glove', 'gloves', 'baseball glove', 'baseball gloves')
   OR et.id IN ('bb-gloves', 'glove', 'gloves', 'baseball-glove', 'baseball-gloves', 'fp-gloves', 'sp-gloves')
GROUP BY et.sport_id, et.id, et.name
ORDER BY LOWER(et.name), et.sport_id, et.id;

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

-- Strong fielding-glove candidates outside the canonical group, including trademark symbols,
-- themed A2000 names, 1786SS, structured retailer categories, and known glove sellers.
WITH glove_candidates AS (
  SELECT d.*,
         (COALESCE(d.title, '') || ' ' || COALESCE(d.brand, '')) AS title_brand,
         (
           COALESCE(d.source_id, '') || ' ' ||
           COALESCE(d.raw->>'category', '') || ' ' ||
           COALESCE(d.raw->>'categoryName', '') || ' ' ||
           COALESCE(d.raw->>'productType', '') || ' ' ||
           COALESCE(d.raw->>'shopifyProductType', '') || ' ' ||
           COALESCE(d.raw->>'collection', '') || ' ' ||
           COALESCE((d.raw->'collections')::text, '') || ' ' ||
           COALESCE((d.raw->'breadcrumbs')::text, '') || ' ' ||
           COALESCE(d.raw->>'seller', '') || ' ' ||
           COALESCE(d.raw->>'sellerName', '') || ' ' ||
           COALESCE(d.raw->>'storeName', '')
         ) AS structured_context
  FROM deals d
)
SELECT d.id, d.title, d.source_id, d.sport_id, d.equipment_type_id, d.size_number,
       'baseball / bb-gloves' AS proposed_read_group,
       CASE
         WHEN d.title_brand ~* 'a(2000|2k)([^a-z0-9]+[a-z][a-z0-9-]*){0,3}[^a-z0-9]+1786(ss)?'
           THEN 'strong family + 1786/1786SS pattern'
         WHEN d.title_brand ~* '(baseball\s+(fielding\s+)?glove|fielding\s+glove|infield(er)?\s+glove|outfield(er)?\s+glove|infield\s+baseball)'
           THEN 'explicit fielding phrase'
         ELSE 'family + size + structured seller/category evidence'
       END AS evidence_reason,
       CASE
         WHEN LOWER(d.title) ~ '(batting|golf|boxing|winter|work|garden|football|goalkeeper|hockey|lacrosse|motorcycle|cycling|ski|snow|fastpitch|slowpitch|softball).*\b(glove|mitt)'
           THEN 'manual-review: negative title evidence'
         WHEN d.sport_id IN ('fastpitch-softball', 'slowpitch-softball', 'golf', 'boxing', 'cricket')
           THEN 'manual-review: conflicting stored sport (strong explicit baseball evidence may project on read)'
         ELSE 'read-path recovery candidate'
       END AS disposition
FROM glove_candidates d
WHERE d.equipment_type_id IS DISTINCT FROM 'bb-gloves'
  AND (
    d.title_brand ~* '(baseball\s+(fielding\s+)?glove|fielding\s+glove|infield(er)?\s+glove|outfield(er)?\s+glove|infield\s+baseball|catcher(''s)?\s+mitt|first\s+base\s+mitt|a(2000|2k)([^a-z0-9]+[a-z][a-z0-9-]*){0,3}[^a-z0-9]+1786(ss)?|heart\s+of\s+the\s+hide|pro\s+preferred)'
    OR (
      d.title_brand ~* '(^|[^a-z0-9])a(2000|2k)([^a-z0-9]|$)'
      AND (
        d.title ~* '(^|[^0-9.])(8|9|1[0-5])(\.[0-9]{1,2})?[\s-]*(["″]|in(ch(es)?)?\.?)?(?=[^0-9.]|$)'
        OR TRIM(REGEXP_REPLACE(COALESCE(d.size_number, ''), '[^0-9.]', '', 'g')) ~ '^(8|9|1[0-5])(\.[0-9]{1,2})?$'
      )
      AND d.structured_context ~* '(baseball.{0,24}(glove|mitt)|(fielding|infield|outfield).{0,16}(glove|mitt)|gloves?\s*&\s*mitts?|justgloves|baseballmonkey|baseball\s+bargains)'
    )
  )
ORDER BY disposition, d.id;
