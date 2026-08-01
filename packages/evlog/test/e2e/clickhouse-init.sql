-- Schema the ClickHouse adapter's default `toClickHouseRow()` targets.
-- Kept in sync with the CREATE TABLE published on the adapter docs page.
CREATE TABLE IF NOT EXISTS evlog_events
(
  timestamp     DateTime64(3, 'UTC'),
  level         LowCardinality(String),
  service       LowCardinality(String),
  environment   LowCardinality(String),
  request_id    String,
  trace_id      String,
  span_id       String,
  method        LowCardinality(String),
  path          String,
  status        Nullable(UInt16),
  duration      String,
  error_name    String,
  error_message String,
  data          String
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service, environment, timestamp);
