const express = require('express');
const router = express.Router();
const portalController = require('../controllers/portalController');
const portalAuthMiddleware = require('../middleware/portalAuthMiddleware');

router.post('/auth/login', portalController.login);
router.get('/transactions', portalAuthMiddleware, portalController.getTransactions);

// === MODIFICATION: Rename old route and add the new one ===
// This route now gets the volume based on the active filters
router.get('/filtered-volume', portalAuthMiddleware, portalController.getFilteredVolume);

// This new route always gets the grand total volume
router.get('/total-volume', portalAuthMiddleware, portalController.getTotalVolume);

router.get('/export-excel', portalAuthMiddleware, portalController.exportTransactions); // This route now handles both formats

module.exports = router;