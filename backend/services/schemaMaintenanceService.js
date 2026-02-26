const pool = require("../config/db");

const ensureRuntimeSchema = async () => {
  try {
    await pool.query(`
      ALTER TABLE request_types
      ADD COLUMN IF NOT EXISTS new_content_reaction VARCHAR(16) NULL AFTER acknowledgement_reaction,
      ADD COLUMN IF NOT EXISTS new_content_reply_text VARCHAR(255) NULL AFTER new_content_reaction
    `);
    console.log(
      "[SCHEMA] request_types columns ensured: new_content_reaction, new_content_reply_text.",
    );
  } catch (error) {
    console.error(
      "[SCHEMA] Failed to ensure request_types new-content columns:",
      error.message,
    );
    throw error;
  }
};

module.exports = {
  ensureRuntimeSchema,
};

