ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `password_reset_otp` varchar(64) DEFAULT NULL AFTER `email_otp_expires`,
  ADD COLUMN IF NOT EXISTS `password_reset_expires` datetime DEFAULT NULL AFTER `password_reset_otp`;
