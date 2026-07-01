CREATE TABLE IF NOT EXISTS `user_profiles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `name` varchar(60) NOT NULL,
  `avatar_color` varchar(20) NOT NULL DEFAULT '#E50914',
  `is_kids` tinyint(1) NOT NULL DEFAULT 0,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_user_profiles_user` (`user_id`, `is_default`),
  CONSTRAINT `user_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `user_profiles` (`user_id`, `name`, `avatar_color`, `is_kids`, `is_default`)
SELECT u.id, COALESCE(NULLIF(u.username, ''), 'Profile'), '#E50914', 0, 1
FROM `users` u
WHERE NOT EXISTS (
  SELECT 1 FROM `user_profiles` p WHERE p.user_id = u.id
);

ALTER TABLE `user_watch_history`
  ADD COLUMN IF NOT EXISTS `profile_id` int(11) DEFAULT NULL AFTER `user_id`;

UPDATE `user_watch_history` h
JOIN `user_profiles` p ON p.user_id = h.user_id AND p.is_default = 1
SET h.profile_id = p.id
WHERE h.profile_id IS NULL;

ALTER TABLE `user_watch_history`
  DROP INDEX `uniq_user_movie_episode`,
  ADD UNIQUE KEY `uniq_profile_movie_episode` (`profile_id`, `movie_id`, `episode_number`),
  ADD KEY `idx_user_watch_history_profile` (`profile_id`, `last_watched_at`),
  ADD CONSTRAINT `user_watch_history_profile_fk`
    FOREIGN KEY (`profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE;

ALTER TABLE `user_favorites`
  ADD COLUMN IF NOT EXISTS `profile_id` int(11) DEFAULT NULL AFTER `user_id`;

UPDATE `user_favorites` f
JOIN `user_profiles` p ON p.user_id = f.user_id AND p.is_default = 1
SET f.profile_id = p.id
WHERE f.profile_id IS NULL;

ALTER TABLE `user_favorites`
  MODIFY `profile_id` int(11) NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`profile_id`, `movie_id`),
  ADD KEY `idx_user_favorites_user_profile` (`user_id`, `profile_id`),
  ADD CONSTRAINT `user_favorites_profile_fk`
    FOREIGN KEY (`profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE;

ALTER TABLE `user_watchlist`
  ADD COLUMN IF NOT EXISTS `profile_id` int(11) DEFAULT NULL AFTER `user_id`;

UPDATE `user_watchlist` w
JOIN `user_profiles` p ON p.user_id = w.user_id AND p.is_default = 1
SET w.profile_id = p.id
WHERE w.profile_id IS NULL;

ALTER TABLE `user_watchlist`
  MODIFY `profile_id` int(11) NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`profile_id`, `movie_id`),
  ADD KEY `idx_user_watchlist_user_profile` (`user_id`, `profile_id`),
  ADD CONSTRAINT `user_watchlist_profile_fk`
    FOREIGN KEY (`profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE;
