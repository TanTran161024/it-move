CREATE TABLE IF NOT EXISTS subtitle_providers (
  id VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  priority INT NOT NULL DEFAULT 100,
  website_url VARCHAR(255) DEFAULT NULL,
  notes VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO subtitle_providers (id, name, enabled, priority, website_url, notes)
VALUES
  ('opensubtitles', 'OpenSubtitles.com', 1, 10, 'https://www.opensubtitles.com', 'Official OpenSubtitles.com API'),
  ('subdl', 'SubDL', 1, 20, 'https://subdl.com', 'SubDL API, optional key')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  website_url = VALUES(website_url),
  notes = VALUES(notes),
  updated_at = CURRENT_TIMESTAMP;
