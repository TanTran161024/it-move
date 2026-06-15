ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 1 AFTER is_admin,
  ADD COLUMN IF NOT EXISTS is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER email_verified,
  ADD COLUMN IF NOT EXISTS email_otp VARCHAR(64) DEFAULT NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS email_otp_expires DATETIME DEFAULT NULL AFTER email_otp;

UPDATE users
SET email_verified = 1,
    is_active = 1
WHERE email_verified IS NULL
   OR is_active IS NULL;
