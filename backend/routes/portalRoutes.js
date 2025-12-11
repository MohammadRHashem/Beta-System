const express = require("express");
const router = express.Router();
const portalController = require("../controllers/portalController");

// NOTE: The login route is now in server.js and is public.
// The portalAuthMiddleware is also applied in server.js.
// This file ONLY contains the routes that should be protected.

router.get("/transactions", portalController.getTransactions);
router.get("/dashboard-summary", portalController.getDashboardSummary);
router.get("/export-excel", portalController.exportTransactions);

router.post("/bridge/confirm-payment", portalController.triggerPartnerConfirmation);

module.exports = router;