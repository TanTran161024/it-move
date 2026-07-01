CREATE TABLE IF NOT EXISTS episode_subtitles (
  id INT NOT NULL AUTO_INCREMENT,
  episode_id INT NOT NULL,
  label VARCHAR(100) NOT NULL DEFAULT 'Tiếng Việt',
  srclang VARCHAR(12) NOT NULL DEFAULT 'vi',
  format VARCHAR(20) NOT NULL DEFAULT 'vtt',
  content MEDIUMTEXT NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_episode_subtitle_lang (episode_id, srclang),
  KEY idx_episode_subtitles_episode (episode_id),
  CONSTRAINT fk_episode_subtitles_episode
    FOREIGN KEY (episode_id) REFERENCES episodes(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
