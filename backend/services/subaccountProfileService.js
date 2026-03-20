const pool = require("../config/db");
const transactionService = require("./subaccountTransactionService");

const sanitizeText = (value, maxLength = 255) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const sanitizeRequiredText = (value, fieldName, maxLength = 255) => {
  const normalized = sanitizeText(value, maxLength);
  if (!normalized) {
    const error = new Error(`${fieldName} is required.`);
    error.status = 400;
    throw error;
  }
  return normalized;
};

const normalizeSortOrder = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return parsed;
};

const normalizeBooleanFlag = (value, fallback = true) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const lowered = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(lowered)) return true;
  if (["0", "false", "no", "off"].includes(lowered)) return false;
  return fallback;
};

const mapProfileEntryRow = (row) => ({
  id: row.id,
  subaccount_id: row.subaccount_id,
  label: row.label || "",
  account_holder_name: row.account_holder_name,
  institution_name: row.institution_name,
  pix_key: row.pix_key,
  pix_copy_code: row.pix_copy_code || "",
  sort_order: Number(row.sort_order || 0),
  is_active: Boolean(row.is_active),
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const buildEntryPayload = (payload = {}, { partial = false } = {}) => {
  const next = {};

  if (!partial || Object.prototype.hasOwnProperty.call(payload, "label")) {
    next.label = sanitizeText(payload.label, 120);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, "account_holder_name")) {
    next.account_holder_name = partial
      ? sanitizeText(payload.account_holder_name, 255)
      : sanitizeRequiredText(payload.account_holder_name, "Account holder name");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, "institution_name")) {
    next.institution_name = partial
      ? sanitizeText(payload.institution_name, 255)
      : sanitizeRequiredText(payload.institution_name, "Institution name");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, "pix_key")) {
    next.pix_key = partial
      ? sanitizeText(payload.pix_key, 255)
      : sanitizeRequiredText(payload.pix_key, "PIX key");
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, "pix_copy_code")) {
    next.pix_copy_code = sanitizeText(payload.pix_copy_code, 5000);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, "sort_order")) {
    next.sort_order = normalizeSortOrder(payload.sort_order, 0);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    next.is_active = normalizeBooleanFlag(payload.is_active, true);
  }

  return next;
};

const getEntriesForSubaccount = async (subaccountId, { activeOnly = false } = {}) => {
  const params = [subaccountId];
  const activeClause = activeOnly ? " AND spe.is_active = 1" : "";
  const [rows] = await pool.query(
    `
      SELECT
        spe.id,
        spe.subaccount_id,
        spe.label,
        spe.account_holder_name,
        spe.institution_name,
        spe.pix_key,
        spe.pix_copy_code,
        spe.sort_order,
        spe.is_active,
        spe.created_at,
        spe.updated_at
      FROM subaccount_profile_entries spe
      WHERE spe.subaccount_id = ?${activeClause}
      ORDER BY spe.sort_order ASC, spe.id ASC
    `,
    params
  );

  return rows.map(mapProfileEntryRow);
};

const getProfileEntryById = async (subaccountId, entryId) => {
  const [[row]] = await pool.query(
    `
      SELECT *
      FROM subaccount_profile_entries
      WHERE id = ? AND subaccount_id = ?
      LIMIT 1
    `,
    [entryId, subaccountId]
  );
  return row ? mapProfileEntryRow(row) : null;
};

const listAdminProfileEntries = async (subaccountId) => {
  const subaccount = await transactionService.getSubaccountById(subaccountId);
  if (!subaccount) {
    const error = new Error("Subaccount not found.");
    error.status = 404;
    throw error;
  }

  return {
    subaccount,
    entries: await getEntriesForSubaccount(subaccountId),
  };
};

const createProfileEntry = async (subaccountId, payload = {}) => {
  const subaccount = await transactionService.getSubaccountById(subaccountId);
  if (!subaccount) {
    const error = new Error("Subaccount not found.");
    error.status = 404;
    throw error;
  }

  const entry = buildEntryPayload(payload);
  const [result] = await pool.query(
    `
      INSERT INTO subaccount_profile_entries (
        subaccount_id,
        label,
        account_holder_name,
        institution_name,
        pix_key,
        pix_copy_code,
        sort_order,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      subaccountId,
      entry.label,
      entry.account_holder_name,
      entry.institution_name,
      entry.pix_key,
      entry.pix_copy_code,
      entry.sort_order,
      entry.is_active ? 1 : 0,
    ]
  );

  return getProfileEntryById(subaccountId, result.insertId);
};

const updateProfileEntry = async (subaccountId, entryId, payload = {}) => {
  const existing = await getProfileEntryById(subaccountId, entryId);
  if (!existing) {
    const error = new Error("Profile entry not found.");
    error.status = 404;
    throw error;
  }

  const updates = buildEntryPayload(payload, { partial: true });
  const merged = {
    ...existing,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)),
  };

  const accountHolderName = sanitizeRequiredText(merged.account_holder_name, "Account holder name");
  const institutionName = sanitizeRequiredText(merged.institution_name, "Institution name");
  const pixKey = sanitizeRequiredText(merged.pix_key, "PIX key");

  await pool.query(
    `
      UPDATE subaccount_profile_entries
      SET
        label = ?,
        account_holder_name = ?,
        institution_name = ?,
        pix_key = ?,
        pix_copy_code = ?,
        sort_order = ?,
        is_active = ?
      WHERE id = ? AND subaccount_id = ?
    `,
    [
      merged.label || null,
      accountHolderName,
      institutionName,
      pixKey,
      merged.pix_copy_code || null,
      normalizeSortOrder(merged.sort_order, 0),
      normalizeBooleanFlag(merged.is_active, true) ? 1 : 0,
      entryId,
      subaccountId,
    ]
  );

  return getProfileEntryById(subaccountId, entryId);
};

const deleteProfileEntry = async (subaccountId, entryId) => {
  const [result] = await pool.query(
    "DELETE FROM subaccount_profile_entries WHERE id = ? AND subaccount_id = ?",
    [entryId, subaccountId]
  );
  if (!result.affectedRows) {
    const error = new Error("Profile entry not found.");
    error.status = 404;
    throw error;
  }
};

const getPortalProfile = async (client) => {
  const subaccount = await transactionService.getPortalSubaccount(client);
  const entries = await getEntriesForSubaccount(subaccount.id, { activeOnly: true });

  return {
    subaccount: {
      id: subaccount.id,
      name: subaccount.name,
      accountType: subaccount.account_type,
      username: client.username,
    },
    entries,
  };
};

module.exports = {
  listAdminProfileEntries,
  createProfileEntry,
  updateProfileEntry,
  deleteProfileEntry,
  getPortalProfile,
};
