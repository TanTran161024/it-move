CREATE TABLE IF NOT EXISTS `ai_movie_feedback` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `profile_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `feedback_type` enum('like','dislike','watched','hide') NOT NULL,
  `source` varchar(40) NOT NULL DEFAULT 'chatbot',
  `session_id` varchar(64) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_ai_movie_feedback_profile` (`profile_id`, `movie_id`, `feedback_type`),
  KEY `idx_ai_movie_feedback_user_profile` (`user_id`, `profile_id`, `updated_at`),
  KEY `idx_ai_movie_feedback_movie` (`movie_id`, `feedback_type`),
  KEY `idx_ai_movie_feedback_session` (`session_id`),
  CONSTRAINT `ai_movie_feedback_user_fk`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ai_movie_feedback_profile_fk`
    FOREIGN KEY (`profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ai_movie_feedback_movie_fk`
    FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ai_movie_feedback_session_fk`
    FOREIGN KEY (`session_id`) REFERENCES `ai_chat_sessions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
