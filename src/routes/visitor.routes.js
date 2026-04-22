const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/visitor.controller');

router.use(authenticate);

router.get('/report', ctrl.getVisitorReport);
router.get('/',       ctrl.getVisitors);
router.post('/',      ctrl.createVisitor);
router.post('/:id/checkin',  authorize('SecurityStaff','BuildingAdmin','SuperAdmin'), ctrl.checkIn);
router.post('/:id/checkout', authorize('SecurityStaff','BuildingAdmin','SuperAdmin'), ctrl.checkOut);

module.exports = router;
