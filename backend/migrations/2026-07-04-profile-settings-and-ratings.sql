ALTER TABLE `user_profiles`
  ADD COLUMN IF NOT EXISTS `avatar_url` text DEFAULT NULL AFTER `avatar_color`,
  ADD COLUMN IF NOT EXISTS `autoplay_next` tinyint(1) NOT NULL DEFAULT 1 AFTER `is_default`,
  ADD COLUMN IF NOT EXISTS `subtitle_style` varchar(32) NOT NULL DEFAULT 'default' AFTER `autoplay_next`,
  ADD COLUMN IF NOT EXISTS `subtitle_track` varchar(64) NOT NULL DEFAULT 'auto' AFTER `subtitle_style`,
  ADD COLUMN IF NOT EXISTS `cinema_default` tinyint(1) NOT NULL DEFAULT 0 AFTER `subtitle_track`;

ALTER TABLE `movie_ratings`
  ADD COLUMN IF NOT EXISTS `profile_id` int(11) DEFAULT NULL AFTER `user_id`;

UPDATE `movie_ratings` r
JOIN `user_profiles` p ON p.user_id = r.user_id AND p.is_default = 1
SET r.profile_id = p.id
WHERE r.profile_id IS NULL;

ALTER TABLE `movie_ratings`
  MODIFY `profile_id` int(11) NOT NULL,
  DROP INDEX `uniq_movie_rating_user`,
  ADD UNIQUE KEY `uniq_movie_rating_profile` (`profile_id`, `movie_id`),
  ADD KEY `idx_movie_ratings_user_profile` (`user_id`, `profile_id`),
  ADD CONSTRAINT `movie_ratings_profile_fk`
    FOREIGN KEY (`profile_id`) REFERENCES `user_profiles` (`id`) ON DELETE CASCADE;
