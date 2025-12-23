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
    await fs.remove("wwebjs_sessions");
    console.log("Logged out and session cleared. Please restart the application.");
    res.status(200).json({ message: "Session cleared. Please restart the application." });
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

exports.syncGroups = async (req, res) => {
  console.log('[SYNC] Starting group synchronization process...');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const freshGroups = await whatsappService.fetchAllGroups();
    const freshGroupIds = new Set(freshGroups.map((g) => g.id));
    console.log(`[SYNC] Found ${freshGroups.length} active groups.`);

    const [staleDbGroups] = await connection.query(
      "SELECT group_jid FROM whatsapp_groups WHERE user_id = 1"
    );
    const staleGroupIds = new Set(staleDbGroups.map((g) => g.group_jid));
    console.log(`[SYNC] Found ${staleDbGroups.length} groups in the database.`);

    const groupsToDelete = [...staleGroupIds].filter(
      (id) => !freshGroupIds.has(id)
    );
    
    if (groupsToDelete.length > 0) {
      console.log(`[SYNC] Deleting ${groupsToDelete.length} obsolete groups.`);
      await connection.query(
        "DELETE FROM whatsapp_groups WHERE user_id = 1 AND group_jid IN (?)",
        [groupsToDelete]
      );
    }

    if (freshGroups.length > 0) {
      const groupValues = freshGroups.map((g) => [1, g.id, g.name]);
      const upsertQuery = `
                INSERT INTO whatsapp_groups (user_id, group_jid, group_name)
                VALUES ?
                ON DUPLICATE KEY UPDATE group_name = VALUES(group_name);
            `;
      await connection.query(upsertQuery, [groupValues]);
    }

    await connection.commit();
    res.status(200).json({
      message: `Sync complete. ${freshGroups.length} groups up-to-date. ${groupsToDelete.length} groups deleted.`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("[SYNC-ERROR] Group sync failed:", error);
    res.status(500).json({
      message: error.message || "An error occurred during group sync.",
    });
  } finally {
    connection.release();
  }
};

exports.broadcastMessage = (req, res) => {
  // === THE FIX: Make socketId optional ===
  const { groupObjects, message, socketId, attachment } = req.body;

  // The broadcast can proceed even if the socketId is missing.
  if (!groupObjects || (!message && !attachment) || !Array.isArray(groupObjects)) {
    return res.status(400).json({ message: "Invalid request body: Missing groups or content." });
  }

  try {
    res.status(202).json({ message: "Broadcast accepted and will start shortly." });

    // The service will handle the case where socketId is null.
    whatsappService.broadcast(req.io, socketId, groupObjects, message, attachment);
  } catch (error) {
    console.error("[CONTROLLER-ERROR] Failed to start broadcast job:", error);
    // This error won't be sent if the socket is down, but it's good practice.
    if (req.io && socketId) {
      req.io.to(socketId).emit("broadcast:error", {
        message: "Failed to start the broadcast process on the server.",
      });
    }
  }
};