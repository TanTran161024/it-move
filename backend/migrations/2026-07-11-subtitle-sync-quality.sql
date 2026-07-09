ALTER TABLE episode_subtitles
  ADD COLUMN IF NOT EXISTS original_content MEDIUMTEXT NULL AFTER content,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) NOT NULL DEFAULT 'unchecked' AFTER is_default,
  ADD COLUMN IF NOT EXISTS sync_score DECIMAL(12,3) NULL AFTER sync_status,
  ADD COLUMN IF NOT EXISTS sync_offset_seconds DECIMAL(9,3) NULL AFTER sync_score,
  ADD COLUMN IF NOT EXISTS sync_drift_seconds DECIMAL(9,3) NULL AFTER sync_offset_seconds,
  ADD COLUMN IF NOT EXISTS sync_report_json JSON NULL AFTER sync_drift_seconds,
  ADD COLUMN IF NOT EXISTS synced_at DATETIME NULL AFTER sync_report_json;
