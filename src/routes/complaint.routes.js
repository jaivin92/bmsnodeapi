const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { documentUpload } = require('../middleware/upload');
const ctrl = require('../controllers/complaint.controller');

router.use(authenticate);

router.get('/',              ctrl.getComplaints);
router.post('/',             documentUpload.single('photo'), ctrl.createComplaint);
router.put('/:id/assign',    authorize('SuperAdmin','BuildingAdmin'), ctrl.assignComplaint);
router.put('/:id/status',    ctrl.updateStatus);
router.post('/:id/feedback', ctrl.submitFeedback);

module.exports = router;
