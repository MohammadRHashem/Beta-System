const express = require('express');
const router = express.Router();
const scheduledWithdrawalController = require('../controllers/scheduledWithdrawalController');
const checkPermission = require('../middleware/permissionMiddleware');

router.get('/', checkPermission('subaccount:withdrawals:view'), scheduledWithdrawalController.getAllSchedules);
router.get('/balances', checkPermission('subaccount:withdrawals:view'), scheduledWithdrawalController.getLiveBalances);
router.post('/', checkPermission('subaccount:withdrawals:create'), scheduledWithdrawalController.createSchedule);
router.put('/:id', checkPermission('subaccount:withdrawals:update'), scheduledWithdrawalController.updateSchedule);
router.patch('/:id/toggle', checkPermission('subaccount:withdrawals:update'), scheduledWithdrawalController.toggleSchedule);
router.post('/:id/withdraw-now', checkPermission('subaccount:withdrawals:update'), scheduledWithdrawalController.withdrawNow);
router.delete('/:id', checkPermission('subaccount:withdrawals:delete'), scheduledWithdrawalController.deleteSchedule);

module.exports = router;
