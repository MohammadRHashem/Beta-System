const fs = require("fs-extra");
const whatsappService = require("../services/whatsappService");
const pool = require("../config/db");

exports.init = () => {
  whatsappService.init();
};

exports.getStatus = (req, res) => {
    const status = whatsappService.getStatus();
    const qr = whatsappService.getQR();
    res.json({ status, qr });
};

exports.logout = async (req, res) => {
  try {
    // This function seems to use an old Baileys-style client.
    // Based on the rest of the code, a full re-init is better.
    await fs.remove("wwebjs_sessions"); // Clears the session data
    console.log("Logged out and session cleared. Re-initializing...");
    // A full process restart is the most reliable way to log out with wweb.js
    res.status(200).json({ message: "Session cleared. Please restart the application to generate a new QR code." });
    // In a PM2 environment, this will trigger a restart if configured.
    process.exit(1); 
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).json({ message: "Error during logout" });
  }
};

exports.getGroups = async (req, res) => {
  try {
    const [groups] = await pool.query(
      "SELECT group_jid as id, group_name as name FROM whatsapp_groups WHERE user_id = 1 ORDER BY group_name"
    );
    res.status(200).json(groups);
  } catch (error) {
    console.error("Error fetching groups from DB:", error);
    res.status(500).json({ message: "Failed to fetch groups from database." });
  }
};

// === ENHANCED LOGGING FOR GROUP SYNC ===
exports.syncGroups = async (req, res) => {
  console.log('[SYNC] Starting group synchronization process...');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    console.log('[SYNC] Fetching latest active groups from WhatsApp...');
    const freshGroups = await whatsappService.fetchAllGroups();
    const freshGroupIds = new Set(freshGroups.map((g) => g.id));
    console.log(`[SYNC] Found ${freshGroups.length} active groups where the bot is a member.`);

    console.log('[SYNC] Fetching existing groups from database...');
    const [staleDbGroups] = await connection.query(
      "SELECT group_jid FROM whatsapp_groups WHERE user_id = 1"
    );
    const staleGroupIds = new Set(staleDbGroups.map((g) => g.group_jid));
    console.log(`[SYNC] Found ${staleDbGroups.length} groups currently in the database.`);

    const groupsToDelete = [...staleGroupIds].filter(
      (id) => !freshGroupIds.has(id)
    );
    
    if (groupsToDelete.length > 0) {
      console.log(`[SYNC] Found ${groupsToDelete.length} obsolete groups to delete. JIDs:`, groupsToDelete);
      await connection.query(
        "DELETE FROM whatsapp_groups WHERE user_id = 1 AND group_jid IN (?)",
        [groupsToDelete]
      );
       console.log(`[SYNC] Successfully deleted ${groupsToDelete.length} obsolete groups from the database.`);
    } else {
        console.log('[SYNC] No obsolete groups found to delete.');
    }

    if (freshGroups.length > 0) {
      const groupValues = freshGroups.map((g) => [1, g.id, g.name]);
      const upsertQuery = `
                INSERT INTO whatsapp_groups (user_id, group_jid, group_name)
                VALUES ?
                ON DUPLICATE KEY UPDATE group_name = VALUES(group_name);
            `;
      await connection.query(upsertQuery, [groupValues]);
      console.log(`[SYNC] Upserted (added or updated) ${freshGroups.length} groups into the database.`);
    }

    await connection.commit();
    console.log('[SYNC] Transaction committed. Sync complete.');
    res.status(200).json({
      message: `Sync complete. ${freshGroups.length} groups are now up-to-date. ${groupsToDelete.length} obsolete groups were deleted.`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("[SYNC-ERROR] Group sync failed, transaction rolled back:", error);
    res.status(500).json({
      message: error.message || "An error occurred during group sync.",
    });
  } finally {
    connection.release();
  }
};

exports.broadcastMessage = (req, res) => {
  const { groupObjects, message, socketId } = req.body;

  if (!groupObjects || !message || !socketId || !Array.isArray(groupObjects)) {
    return res.status(400).json({ message: "Invalid request body." });
  }

  try {
    res
      .status(202)
      .json({ message: "Broadcast accepted and will start shortly." });

    console.log(
      `[CONTROLLER] Handing off broadcast job to Baileys service for socket ${socketId}.`
    );
    whatsappService.broadcast(req.io, socketId, groupObjects, message);
  } catch (error) {
    console.error("[CONTROLLER-ERROR] Failed to start broadcast job:", error);
    if (req.io && socketId) {
      req.io.to(socketId).emit("broadcast:error", {
        message: "Failed to start the broadcast process on the server.",
      });
    }
  }
};