const express = require('express');
const router = express.Router();
const usdtWalletController = require('../controllers/usdtWalletController');
const checkPermission = require('../middleware/permissionMiddleware');
// Note: These routes will be placed behind the main authMiddleware in server.js

router.use(checkPermission('settings:edit_usdt_wallets'));
router.get('/', usdtWalletController.getAllWallets);
router.post('/', usdtWalletController.createWallet);
router.put('/:id', usdtWalletController.updateWallet);
router.delete('/:id', usdtWalletController.deleteWallet);
router.patch('/:id/toggle', usdtWalletController.toggleWallet);

module.exports = router;
