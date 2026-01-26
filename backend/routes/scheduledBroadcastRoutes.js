const express = require('express');
const router = express.Router();
const scheduledBroadcastController = require('../controllers/scheduledBroadcastController');
const checkPermission = require('../middleware/permissionMiddleware');

router.get('/', checkPermission(['broadcast:schedules:view', 'broadcast:schedule']), scheduledBroadcastController.getAllSchedules);
router.post('/', checkPermission(['broadcast:schedules:create', 'broadcast:schedule']), scheduledBroadcastController.createSchedule);
router.put('/:id', checkPermission(['broadcast:schedules:update', 'broadcast:schedule']), scheduledBroadcastController.updateSchedule);
router.patch('/:id/toggle', checkPermission(['broadcast:schedules:update', 'broadcast:schedule']), scheduledBroadcastController.toggleSchedule);
router.delete('/:id', checkPermission(['broadcast:schedules:delete', 'broadcast:schedule']), scheduledBroadcastController.deleteSchedule);

module.exports = router;
