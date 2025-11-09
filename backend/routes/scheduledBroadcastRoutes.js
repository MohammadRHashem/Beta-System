const express = require('express');
const router = express.Router();
const scheduledBroadcastController = require('../controllers/scheduledBroadcastController');

router.get('/', scheduledBroadcastController.getAllSchedules);
router.post('/', scheduledBroadcastController.createSchedule);
router.put('/:id', scheduledBroadcastController.updateSchedule);
router.patch('/:id/toggle', scheduledBroadcastController.toggleSchedule);
router.delete('/:id', scheduledBroadcastController.deleteSchedule);

module.exports = router;