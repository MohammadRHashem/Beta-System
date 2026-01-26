-- Migration 002: Add user_roles join table for multi-role users

CREATE TABLE IF NOT EXISTS user_roles (
  user_id int NOT NULL,
  role_id int NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role_id (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO user_roles (user_id, role_id)
SELECT id, role_id
FROM users
WHERE role_id IS NOT NULL;

UPDATE users SET token_version = token_version + 1;
