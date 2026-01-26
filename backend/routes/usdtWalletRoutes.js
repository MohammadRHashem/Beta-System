const express = require('express');
const router = express.Router();
const usdtWalletController = require('../controllers/usdtWalletController');
const checkPermission = require('../middleware/permissionMiddleware');
// Note: These routes will be placed behind the main authMiddleware in server.js

router.get('/', checkPermission(['usdt_wallets:view', 'settings:edit_usdt_wallets']), usdtWalletController.getAllWallets);
router.post('/', checkPermission(['usdt_wallets:create', 'settings:edit_usdt_wallets']), usdtWalletController.createWallet);
router.put('/:id', checkPermission(['usdt_wallets:update', 'settings:edit_usdt_wallets']), usdtWalletController.updateWallet);
router.delete('/:id', checkPermission(['usdt_wallets:delete', 'settings:edit_usdt_wallets']), usdtWalletController.deleteWallet);
router.patch('/:id/toggle', checkPermission(['usdt_wallets:toggle', 'settings:edit_usdt_wallets']), usdtWalletController.toggleWallet);

module.exports = router;
