const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { billUpload } = require('../middleware/upload');
const ctrl = require('../controllers/billing.controller');

router.use(authenticate);

router.get('/summary', ctrl.getBillingSummary);
router.get('/',        ctrl.getBills);
router.post('/',       authorize('SuperAdmin','BuildingAdmin'), billUpload.single('bill'), ctrl.createBill);
router.get('/:id',     ctrl.getBillById);
router.post('/:id/pay', ctrl.payBill);

module.exports = router;
