const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/dashboard.controller');

router.use(authenticate);

router.get('/super-admin',    authorize('SuperAdmin'), ctrl.getSuperAdminDashboard);
router.get('/building-admin', authorize('SuperAdmin','BuildingAdmin'), ctrl.getBuildingAdminDashboard);
router.get('/resident',       authorize('Resident','Tenant'), ctrl.getResidentDashboard);

module.exports = router;
