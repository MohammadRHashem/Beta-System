const express = require("express");
const router = express.Router();
const portalController = require("../controllers/portalController");

// NOTE: The login route is now in server.js and is public.
// The portalAuthMiddleware is also applied in server.js.
// This file ONLY contains the routes that should be protected.

router.get("/transactions", portalController.getTransactions);
router.get("/dashboard-summary", portalController.getDashboardSummary);
router.get("/profile", portalController.getProfile);
router.get("/export-excel", portalController.exportTransactions);
router.post("/transactions", portalController.createTransaction);
router.put("/transactions/:id", portalController.updateTransaction);
router.delete("/transactions/:id", portalController.deleteTransaction);
router.patch("/transactions/visibility", portalController.updateTransactionVisibility);
router.patch("/transactions/badge", portalController.updateTransactionBadge);
router.get("/trkbit/transactions", portalController.getTrkbitTransactionsForTransfer);
router.post("/transactions/confirm", portalController.updateTransactionConfirmation);
router.post("/transactions/notes", portalController.updateTransactionNotes);
router.post("/transactions/debit", portalController.createCrossDebit);
router.post("/trkbit/transactions/claim", portalController.claimTrkbitTransaction);


module.exports = router;
