CREATE TABLE IF NOT EXISTS ai_chat_sessions (
  id VARCHAR(64) NOT NULL,
  user_id INT NULL,
  profile_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ai_chat_sessions_user (user_id),
  INDEX idx_ai_chat_sessions_profile (profile_id),
  CONSTRAINT fk_ai_chat_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_ai_chat_sessions_profile
    FOREIGN KEY (profile_id) REFERENCES user_profiles(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  session_id VARCHAR(64) NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  source VARCHAR(64) NULL,
  provider VARCHAR(64) NULL,
  recommendation_ids JSON NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ai_chat_messages_session_created (session_id, created_at),
  CONSTRAINT fk_ai_chat_messages_session
    FOREIGN KEY (session_id) REFERENCES ai_chat_sessions(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
