-- READ ONLY. Produces the production inputs for a separately reviewed migration.
-- It intentionally contains no UPDATE, DELETE, INSERT, or DDL statements.

-- Raw assignment counts, including taxonomy rows with zero deals.
SELECT et.sport_id, et.id AS equipment_type_id, et.name, et.user_created,
       COUNT(d.id) AS deal_count
FROM equipment_types et
LEFT JOIN deals d ON d.equipment_type_id = et.id
GROUP BY et.sport_id, et.id, et.name, et.user_created
ORDER BY et.sport_id, et.name, et.id;

-- Unclassified deals.
SELECT
  COUNT(*) FILTER (WHERE sport_id IS NULL) AS missing_sport,
  COUNT(*) FILTER (WHERE equipment_type_id IS NULL) AS missing_equipment,
  COUNT(*) FILTER (WHERE sport_id IS NULL AND equipment_type_id IS NULL) AS missing_both
FROM deals;

-- Stored sport conflicts with the equipment type's owning sport.
SELECT d.id, d.title, d.sport_id AS deal_sport_id,
       d.equipment_type_id, et.sport_id AS equipment_sport_id
FROM deals d
JOIN equipment_types et ON et.id = d.equipment_type_id
WHERE d.sport_id IS DISTINCT FROM et.sport_id
ORDER BY d.sport_id, d.equipment_type_id, d.id;

-- Baseball-bat migration dry run. Review this result before authoring a write migration.
SELECT d.id, d.title, d.sport_id, d.equipment_type_id,
       'bb-bats'::text AS proposed_equipment_type_id,
       CASE
         WHEN LOWER(d.title) ~ '(fastpitch|slowpitch|softball|cricket)' THEN 'manual-review: negative title evidence'
         WHEN d.sport_id IN ('fastpitch-softball', 'slowpitch-softball') THEN 'manual-review: softball sport'
         ELSE 'eligible'
       END AS disposition
FROM deals d
WHERE d.equipment_type_id IN ('baseball-bat', 'bat')
ORDER BY disposition, d.id;
