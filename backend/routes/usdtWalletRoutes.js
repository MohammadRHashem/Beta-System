const express = require('express');
const router = express.Router();
const usdtWalletController = require('../controllers/usdtWalletController');
const checkPermission = require('../middleware/permissionMiddleware');
// Note: These routes will be placed behind the main authMiddleware in server.js

router.get('/', checkPermission('usdt_wallets:view'), usdtWalletController.getAllWallets);
router.post('/', checkPermission('usdt_wallets:create'), usdtWalletController.createWallet);
router.put('/:id', checkPermission('usdt_wallets:update'), usdtWalletController.updateWallet);
router.delete('/:id', checkPermission('usdt_wallets:delete'), usdtWalletController.deleteWallet);
router.patch('/:id/toggle', checkPermission('usdt_wallets:toggle'), usdtWalletController.toggleWallet);

module.exports = router;
