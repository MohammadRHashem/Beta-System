const express = require("express");
const router = express.Router();
const portalController = require("../controllers/portalController");
const portalAuthMiddleware = require("../middleware/portalAuthMiddleware");

router.post("/auth/login", portalController.login);
router.get(
  "/transactions",
  portalAuthMiddleware,
  portalController.getTransactions
);

router.get(
  "/filtered-volume",
  portalAuthMiddleware,
  portalController.getFilteredVolume
);

router.get(
  "/export-excel",
  portalAuthMiddleware,
  portalController.exportTransactions
); // This route now handles both formats

module.exports = router;
