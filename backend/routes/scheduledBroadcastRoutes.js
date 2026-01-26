const express = require('express');
const router = express.Router();
const scheduledBroadcastController = require('../controllers/scheduledBroadcastController');
const checkPermission = require('../middleware/permissionMiddleware');

router.get('/', checkPermission('broadcast:schedules:view'), scheduledBroadcastController.getAllSchedules);
router.post('/', checkPermission('broadcast:schedules:create'), scheduledBroadcastController.createSchedule);
router.put('/:id', checkPermission('broadcast:schedules:update'), scheduledBroadcastController.updateSchedule);
router.patch('/:id/toggle', checkPermission('broadcast:schedules:update'), scheduledBroadcastController.toggleSchedule);
router.delete('/:id', checkPermission('broadcast:schedules:delete'), scheduledBroadcastController.deleteSchedule);

module.exports = router;
