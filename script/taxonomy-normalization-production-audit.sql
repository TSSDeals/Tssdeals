-- TSSDeals comprehensive taxonomy/data-quality assessment.
-- READ ONLY: this file intentionally contains SELECT statements only.
-- Run with a PostgreSQL role that has CONNECT + SELECT only.
-- Recommended: psql -X -v ON_ERROR_STOP=1 "$READ_ONLY_DATABASE_URL" -f this-file.sql

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15min';
SET LOCAL lock_timeout = '5s';
SET LOCAL idle_in_transaction_session_timeout = '20min';

-- A. Audit identity and scope.
SELECT now() AS captured_at,
       current_database() AS database_name,
       current_user AS database_user,
       current_setting('transaction_read_only') AS transaction_read_only,
       pg_is_in_recovery() AS is_replica;

SELECT 'sports' AS entity, count(*) AS rows FROM sports
UNION ALL SELECT 'equipment_types', count(*) FROM equipment_types
UNION ALL SELECT 'equipment_sub_filters', count(*) FROM equipment_sub_filters
UNION ALL SELECT 'sources', count(*) FROM sources
UNION ALL SELECT 'deals', count(*) FROM deals
UNION ALL SELECT 'deal_sub_filters', count(*) FROM deal_sub_filters
UNION ALL SELECT 'ai_classifications', count(*) FROM ai_classifications
UNION ALL SELECT 'classification_review_queue', count(*) FROM classification_review_queue
ORDER BY entity;

-- B. Complete taxonomy inventory and assignment counts.
SELECT s.id, s.name, s.user_created,
       count(DISTINCT et.id) AS equipment_type_count,
       count(DISTINCT d.id) AS deal_count
FROM sports s
LEFT JOIN equipment_types et ON et.sport_id = s.id
LEFT JOIN deals d ON d.sport_id = s.id
GROUP BY s.id, s.name, s.user_created
ORDER BY s.name, s.id;

SELECT et.id, et.name, et.sport_id, s.name AS sport_name, et.user_created,
       count(DISTINCT sf.id) AS sub_filter_count,
       count(DISTINCT d.id) AS deal_count,
       count(DISTINCT d.source_id) AS source_count
FROM equipment_types et
LEFT JOIN sports s ON s.id = et.sport_id
LEFT JOIN equipment_sub_filters sf ON sf.equipment_type_id = et.id
LEFT JOIN deals d ON d.equipment_type_id = et.id
GROUP BY et.id, et.name, et.sport_id, s.name, et.user_created
ORDER BY s.name NULLS LAST, et.name, et.id;

SELECT sf.id, sf.name, sf.equipment_type_id, et.name AS equipment_name,
       et.sport_id, count(DISTINCT dsf.deal_id) AS joined_deal_count,
       count(DISTINCT d.id) AS legacy_primary_deal_count
FROM equipment_sub_filters sf
LEFT JOIN equipment_types et ON et.id = sf.equipment_type_id
LEFT JOIN deal_sub_filters dsf ON dsf.sub_filter_id = sf.id
LEFT JOIN deals d ON d.sub_filter_id = sf.id
GROUP BY sf.id, sf.name, sf.equipment_type_id, et.name, et.sport_id
ORDER BY et.sport_id, et.name, sf.name, sf.id;

SELECT src.id, src.name, src.category, src.base_url, src.is_our_store,
       src.is_manufacturer, src.priority_boost, count(d.id) AS deal_count,
       count(*) FILTER (WHERE d.sport_id IS NULL) AS null_sport_count,
       count(*) FILTER (WHERE d.equipment_type_id IS NULL) AS null_equipment_count
FROM sources src
LEFT JOIN deals d ON d.source_id = src.id
GROUP BY src.id, src.name, src.category, src.base_url, src.is_our_store,
         src.is_manufacturer, src.priority_boost
ORDER BY deal_count DESC, src.id;

-- C. Duplicate, legacy, generic, orphaned, and conflicting taxonomy.
SELECT lower(btrim(name)) AS normalized_label, sport_id,
       count(*) AS id_count,
       array_agg(id ORDER BY id) AS ids,
       array_agg(name ORDER BY id) AS labels,
       bool_or(user_created) AS any_user_created
FROM equipment_types
GROUP BY lower(btrim(name)), sport_id
HAVING count(*) > 1
ORDER BY id_count DESC, sport_id, normalized_label;

SELECT regexp_replace(lower(btrim(name)), '(s|es)$', '') AS singularized_label,
       sport_id, count(*) AS id_count,
       array_agg(id ORDER BY id) AS ids,
       array_agg(name ORDER BY id) AS labels
FROM equipment_types
GROUP BY regexp_replace(lower(btrim(name)), '(s|es)$', ''), sport_id
HAVING count(*) > 1
ORDER BY id_count DESC, sport_id, singularized_label;

SELECT et.id, et.name, et.sport_id, et.user_created, count(d.id) AS deal_count
FROM equipment_types et
LEFT JOIN deals d ON d.equipment_type_id = et.id
WHERE et.name ~* '^(bat|bats|glove|gloves|other[[:space:]]*[0-9]*)$'
   OR et.id ~* '(^|-)other-?[0-9]*$'
GROUP BY et.id, et.name, et.sport_id, et.user_created
ORDER BY et.sport_id, et.name, et.id;

SELECT 'equipment_without_sport' AS issue, et.id AS record_id, et.name AS detail
FROM equipment_types et WHERE et.sport_id IS NULL
UNION ALL
SELECT 'equipment_orphan_sport', et.id, et.name || ' -> ' || et.sport_id
FROM equipment_types et LEFT JOIN sports s ON s.id = et.sport_id
WHERE et.sport_id IS NOT NULL AND s.id IS NULL
UNION ALL
SELECT 'sub_filter_orphan_equipment', sf.id, sf.name || ' -> ' || sf.equipment_type_id
FROM equipment_sub_filters sf LEFT JOIN equipment_types et ON et.id = sf.equipment_type_id
WHERE et.id IS NULL
ORDER BY issue, record_id;

SELECT d.id, d.title, d.source_id, d.sport_id AS stored_sport_id,
       d.equipment_type_id, et.sport_id AS equipment_owner_sport_id,
       et.name AS equipment_label
FROM deals d
LEFT JOIN equipment_types et ON et.id = d.equipment_type_id
WHERE d.sport_id IS NULL OR d.equipment_type_id IS NULL OR et.id IS NULL
   OR et.sport_id IS DISTINCT FROM d.sport_id
ORDER BY d.source_id, d.id;

-- D. Assignment distribution, Other backlog, and representative examples.
SELECT d.sport_id, d.equipment_type_id, et.name AS equipment_label,
       d.source_id, count(*) AS deal_count
FROM deals d LEFT JOIN equipment_types et ON et.id = d.equipment_type_id
GROUP BY d.sport_id, d.equipment_type_id, et.name, d.source_id
ORDER BY deal_count DESC, d.sport_id, d.equipment_type_id, d.source_id;

SELECT d.sport_id, d.equipment_type_id, et.name AS equipment_label,
       d.source_id, count(*) AS deal_count,
       (array_agg(jsonb_build_object('id', d.id, 'title', d.title)
                  ORDER BY d.last_seen_at DESC))[1:5] AS examples
FROM deals d LEFT JOIN equipment_types et ON et.id = d.equipment_type_id
WHERE d.equipment_type_id IS NULL
   OR et.name ~* '^(other([[:space:]]*[0-9]+)?|bat|bats|glove|gloves)$'
   OR d.equipment_type_id ~* '(^|-)other-?[0-9]*$'
GROUP BY d.sport_id, d.equipment_type_id, et.name, d.source_id
ORDER BY deal_count DESC, d.sport_id, d.equipment_type_id;

-- E. High-precision title/stored-sport conflicts. These are candidates, not an UPDATE list.
WITH evidence AS (
  SELECT d.*,
    CASE
      WHEN title ~* '\mfast[ -]?pitch\M' THEN 'fastpitch-softball'
      WHEN title ~* '\mslow[ -]?pitch\M' THEN 'slowpitch-softball'
      WHEN title ~* '\m(baseball|bbcor|usa baseball)\M' THEN 'baseball'
      WHEN title ~* '\m(golf|putter|fairway wood)\M' THEN 'golf'
      WHEN title ~* '\m(soccer|futsal|goalkeeper)\M' THEN 'soccer'
      WHEN title ~* '\m(basketball|backboard|hoop)\M' THEN 'basketball'
      WHEN title ~* '\m(football|quarterback)\M' THEN 'football'
      WHEN title ~* '\m(lacrosse)\M' THEN 'lacrosse'
      WHEN title ~* '\m(tennis|racquet)\M' THEN 'tennis'
      WHEN title ~* '\m(hockey|puck)\M' THEN 'hockey'
      WHEN title ~* '\mvolleyball\M' THEN 'volleyball'
      WHEN title ~* '\m(cricket|wicket)\M' THEN 'cricket'
      ELSE NULL
    END AS evidence_sport_id
  FROM deals d
)
SELECT evidence_sport_id, sport_id AS stored_sport_id, equipment_type_id,
       source_id, count(*) AS deal_count,
       (array_agg(jsonb_build_object('id', id, 'title', title)
                  ORDER BY last_seen_at DESC))[1:10] AS examples
FROM evidence
WHERE evidence_sport_id IS NOT NULL AND evidence_sport_id IS DISTINCT FROM sport_id
GROUP BY evidence_sport_id, sport_id, equipment_type_id, source_id
ORDER BY deal_count DESC, evidence_sport_id, sport_id;

WITH evidence AS (
  SELECT d.*,
    CASE WHEN title ~* '\mfast[ -]?pitch\M' THEN 'fastpitch-softball'
         WHEN title ~* '\mslow[ -]?pitch\M' THEN 'slowpitch-softball'
         WHEN title ~* '\mbaseball\M' THEN 'baseball' END AS evidence_sport_id
  FROM deals d
)
SELECT evidence_sport_id, sport_id AS stored_sport_id, equipment_type_id,
       source_id, count(*) AS deal_count,
       (array_agg(jsonb_build_object('id', id, 'title', title)
                  ORDER BY last_seen_at DESC))[1:10] AS examples
FROM evidence
WHERE evidence_sport_id IS NOT NULL
  AND evidence_sport_id IS DISTINCT FROM sport_id
  AND sport_id IN ('baseball', 'fastpitch-softball', 'slowpitch-softball')
GROUP BY evidence_sport_id, sport_id, equipment_type_id, source_id
ORDER BY deal_count DESC;

-- F. Brand inventory and likely aliases. The second query is a candidate generator.
SELECT brand, count(*) AS deal_count, count(DISTINCT source_id) AS source_count,
       min(found_at) AS first_seen, max(last_seen_at) AS last_seen
FROM deals
GROUP BY brand
ORDER BY deal_count DESC NULLS LAST, brand;

SELECT regexp_replace(lower(coalesce(brand, '')), '[^a-z0-9]+', '', 'g') AS alias_key,
       count(DISTINCT brand) AS spelling_count,
       array_agg(DISTINCT brand ORDER BY brand) AS spellings,
       count(*) AS deal_count
FROM deals
WHERE nullif(btrim(brand), '') IS NOT NULL
GROUP BY regexp_replace(lower(brand), '[^a-z0-9]+', '', 'g')
HAVING count(DISTINCT brand) > 1
ORDER BY deal_count DESC, alias_key;

-- G. Preserved raw source fields and source-category values.
SELECT d.source_id, k.key AS raw_key, count(*) AS populated_count,
       pg_typeof(k.value) AS value_type
FROM deals d
CROSS JOIN LATERAL jsonb_each(coalesce(d.raw, '{}'::jsonb)) k
GROUP BY d.source_id, k.key, pg_typeof(k.value)
ORDER BY d.source_id, populated_count DESC, raw_key;

SELECT d.source_id, k.key AS category_key, k.value AS category_value,
       count(*) AS deal_count
FROM deals d
CROSS JOIN LATERAL jsonb_each(coalesce(d.raw, '{}'::jsonb)) k
WHERE lower(k.key) ~ '(category|categories|producttype|product_type|collection|taxonomy|department|breadcrumb|sport)'
GROUP BY d.source_id, k.key, k.value
ORDER BY d.source_id, deal_count DESC, category_key;

-- H. Canonical-attribute completeness and malformed values.
SELECT count(*) AS total_deals,
       count(*) FILTER (WHERE nullif(btrim(brand), '') IS NULL) AS missing_brand,
       count(*) FILTER (WHERE sport_id IS NULL) AS missing_sport,
       count(*) FILTER (WHERE equipment_type_id IS NULL) AS missing_equipment,
       count(*) FILTER (WHERE sub_filter_id IS NULL) AS missing_legacy_primary_sub_filter,
       count(*) FILTER (WHERE size_number IS NULL) AS missing_size,
       count(*) FILTER (WHERE drop_weight IS NULL) AS missing_drop,
       count(*) FILTER (WHERE classification_source IS NULL) AS missing_classification_source,
       count(*) FILTER (WHERE classification_confidence IS NULL) AS missing_classification_confidence
FROM deals;

SELECT source_id, size_number, count(*) AS deal_count,
       (array_agg(title ORDER BY last_seen_at DESC))[1:5] AS examples
FROM deals
WHERE size_number IS NOT NULL
  AND btrim(size_number) !~ '^[0-9]+([.][0-9]+)?$'
GROUP BY source_id, size_number
ORDER BY deal_count DESC, source_id, size_number;

SELECT source_id, drop_weight, count(*) AS deal_count,
       (array_agg(title ORDER BY last_seen_at DESC))[1:5] AS examples
FROM deals
WHERE drop_weight IS NOT NULL AND (drop_weight < 0 OR drop_weight > 20)
GROUP BY source_id, drop_weight
ORDER BY deal_count DESC, source_id, drop_weight;

-- Source identifiers. Extend this list when the raw-key inventory reveals another supplier key.
WITH identifiers AS (
  SELECT d.id, d.source_id, d.sport_id, d.equipment_type_id, d.title,
         x.kind, nullif(btrim(x.value), '') AS value
  FROM deals d
  CROSS JOIN LATERAL (VALUES
    ('upc', coalesce(d.raw->>'upc', d.raw->>'UPC', d.raw->>'gtin', d.raw->>'impactGtin', d.raw->>'cjGtin')),
    ('sku', coalesce(d.raw->>'sku', d.raw->>'SKU', d.raw->>'shopifySku', d.raw->>'merchantSku')),
    ('item_number', coalesce(d.raw->>'itemNumber', d.raw->>'item_number', d.raw->>'ebayItemId')),
    ('model', coalesce(d.raw->>'model', d.raw->>'modelNumber', d.raw->>'mpn')),
    ('product_id', coalesce(d.raw->>'productId', d.raw->>'shopifyProductId', d.raw->>'wcProductId', d.raw->>'cjProductId'))
  ) x(kind, value)
)
SELECT kind,
       count(*) FILTER (WHERE value IS NOT NULL) AS populated,
       count(*) FILTER (WHERE value IS NULL) AS missing,
       count(*) FILTER (WHERE kind = 'upc' AND value IS NOT NULL
                         AND regexp_replace(value, '[^0-9]', '', 'g') !~ '^[0-9]{8,14}$') AS malformed_upc
FROM identifiers
GROUP BY kind
ORDER BY kind;

WITH identifiers AS (
  SELECT d.id, d.source_id, d.sport_id, d.equipment_type_id, d.title,
         x.kind, regexp_replace(lower(x.value), '[^a-z0-9]', '', 'g') AS normalized_value
  FROM deals d
  CROSS JOIN LATERAL (VALUES
    ('upc', coalesce(d.raw->>'upc', d.raw->>'UPC', d.raw->>'gtin', d.raw->>'impactGtin', d.raw->>'cjGtin')),
    ('sku', coalesce(d.raw->>'sku', d.raw->>'SKU', d.raw->>'shopifySku', d.raw->>'merchantSku')),
    ('item_number', coalesce(d.raw->>'itemNumber', d.raw->>'item_number', d.raw->>'ebayItemId')),
    ('model', coalesce(d.raw->>'model', d.raw->>'modelNumber', d.raw->>'mpn'))
  ) x(kind, value)
  WHERE nullif(btrim(x.value), '') IS NOT NULL
), collisions AS (
  SELECT kind, normalized_value, count(*) AS row_count,
         count(DISTINCT (sport_id, equipment_type_id)) AS classification_count,
         jsonb_agg(jsonb_build_object('id', id, 'source', source_id, 'sport', sport_id,
                   'equipment', equipment_type_id, 'title', title) ORDER BY id) AS records
  FROM identifiers
  WHERE length(normalized_value) >= 5
  GROUP BY kind, normalized_value
)
SELECT * FROM collisions
WHERE row_count > 1 AND classification_count > 1
ORDER BY row_count DESC, kind, normalized_value;

-- I. Existing classification provenance and Admin queue state.
SELECT classification_source, classification_confidence, sport_id, equipment_type_id,
       count(*) AS deal_count
FROM deals
GROUP BY classification_source, classification_confidence, sport_id, equipment_type_id
ORDER BY deal_count DESC;

SELECT status, confidence, suggested_sport_id, suggested_sport_name,
       suggested_equipment_name, count(*) AS review_count,
       min(created_at) AS oldest, max(created_at) AS newest
FROM classification_review_queue
GROUP BY status, confidence, suggested_sport_id, suggested_sport_name, suggested_equipment_name
ORDER BY status, review_count DESC;

-- J. Initial Bat/Glove regression families, including known live problem records.
SELECT d.id, d.title, d.source_id, d.sport_id, d.equipment_type_id,
       et.name AS equipment_label, d.size_number, d.drop_weight,
       d.classification_source, d.classification_confidence
FROM deals d LEFT JOIN equipment_types et ON et.id = d.equipment_type_id
WHERE d.title ~* '(Louisville.*Supra|Wilson.*A2000|Wilson.*A2K|Marucci.*Capitol)'
ORDER BY d.title, d.source_id, d.id;

COMMIT;
