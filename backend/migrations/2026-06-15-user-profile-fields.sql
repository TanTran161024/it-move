ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `avatar_url` text DEFAULT NULL AFTER `gender`,
  ADD COLUMN IF NOT EXISTS `phone` varchar(20) DEFAULT NULL AFTER `avatar_url`,
  ADD COLUMN IF NOT EXISTS `birth_date` date DEFAULT NULL AFTER `phone`;
