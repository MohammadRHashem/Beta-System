const express = require('express');
const router = express.Router();
const scheduledWithdrawalController = require('../controllers/scheduledWithdrawalController');
const checkPermission = require('../middleware/permissionMiddleware');

router.get('/', checkPermission('subaccount:withdrawals:view'), scheduledWithdrawalController.getAllSchedules);
router.post('/', checkPermission('subaccount:withdrawals:create'), scheduledWithdrawalController.createSchedule);
router.put('/:id', checkPermission('subaccount:withdrawals:update'), scheduledWithdrawalController.updateSchedule);
router.patch('/:id/toggle', checkPermission('subaccount:withdrawals:update'), scheduledWithdrawalController.toggleSchedule);
router.delete('/:id', checkPermission('subaccount:withdrawals:delete'), scheduledWithdrawalController.deleteSchedule);

module.exports = router;
