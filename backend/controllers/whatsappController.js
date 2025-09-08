const fs = require("fs-extra");
const whatsappService = require("../services/whatsappService");
const pool = require("../config/db");

exports.init = () => {
  whatsappService.init();
};

exports.getStatus = (req, res) => {
    // This assumes you have refactored to a sessionManager as discussed
    // If you are still on a single-session model:
    const status = whatsappService.getStatus();
    const qr = whatsappService.getQR(); // Get the current QR code
    res.json({ status, qr }); // Return both status and qr code together
};

exports.logout = async (req, res) => {
  try {
    const sock = whatsappService.getSocket();
    if (sock) {
      await sock.logout();
    }
    await fs.remove("baileys_auth_info");
    console.log("Logged out and session cleared.");
    whatsappService.init();
    res.status(200).json({ message: "Logged out successfully" });
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
    
    console.log('[SYNC] Fetching latest groups from WhatsApp...');
    const freshGroups = await whatsappService.fetchAllGroups();
    const freshGroupIds = new Set(freshGroups.map((g) => g.id));
    console.log(`[SYNC] Found ${freshGroups.length} active groups on WhatsApp.`);

    console.log('[SYNC] Fetching existing groups from database...');
    const [staleDbGroups] = await connection.query(
      "SELECT group_jid FROM whatsapp_groups WHERE user_id = 1"
    );
    const staleGroupIds = new Set(staleDbGroups.map((g) => g.group_jid));
    console.log(`[SYNC] Found ${staleDbGroups.length} groups in the database.`);

    const groupsToDelete = [...staleGroupIds].filter(
      (id) => !freshGroupIds.has(id)
    );
    
    if (groupsToDelete.length > 0) {
      console.log(`[SYNC] Identifying ${groupsToDelete.length} obsolete groups to delete:`, groupsToDelete);
      await connection.query(
        "DELETE FROM whatsapp_groups WHERE user_id = 1 AND group_jid IN (?)",
        [groupsToDelete]
      );
       console.log(`[SYNC] Successfully deleted ${groupsToDelete.length} obsolete groups.`);
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
      console.log(`[SYNC] Upserted ${freshGroups.length} groups into the database.`);
    }

    await connection.commit();
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
