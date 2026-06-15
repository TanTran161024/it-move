CREATE TABLE IF NOT EXISTS `user_favorites` (
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`, `movie_id`),
  KEY `idx_user_favorites_movie` (`movie_id`),
  CONSTRAINT `user_favorites_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_favorites_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `user_watchlist` (
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`, `movie_id`),
  KEY `idx_user_watchlist_movie` (`movie_id`),
  CONSTRAINT `user_watchlist_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_watchlist_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `user_watch_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `movie_id` int(11) NOT NULL,
  `episode_id` int(11) DEFAULT NULL,
  `episode_number` int(11) DEFAULT NULL,
  `progress_seconds` int(11) NOT NULL DEFAULT 0,
  `duration_seconds` int(11) NOT NULL DEFAULT 0,
  `completed` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `last_watched_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_user_movie_episode` (`user_id`, `movie_id`, `episode_number`),
  KEY `idx_user_watch_history_movie` (`movie_id`),
  KEY `idx_user_watch_history_episode` (`episode_id`),
  KEY `idx_user_watch_history_last` (`user_id`, `last_watched_at`),
  CONSTRAINT `user_watch_history_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_watch_history_ibfk_2` FOREIGN KEY (`movie_id`) REFERENCES `movies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_watch_history_ibfk_3` FOREIGN KEY (`episode_id`) REFERENCES `episodes` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
