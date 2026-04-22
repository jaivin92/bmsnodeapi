const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { documentUpload } = require('../middleware/upload');
const ctrl = require('../controllers/canteen.controller');

router.use(authenticate);

router.get('/menu',             ctrl.getMenu);
router.post('/menu',            authorize('SuperAdmin','BuildingAdmin','CanteenStaff'), documentUpload.single('image'), ctrl.addMenuItem);
router.put('/menu/:id',         authorize('SuperAdmin','BuildingAdmin','CanteenStaff'), ctrl.updateMenuItem);
router.get('/orders',           ctrl.getOrders);
router.post('/orders',          ctrl.placeOrder);
router.put('/orders/:id/status',authorize('SuperAdmin','BuildingAdmin','CanteenStaff'), ctrl.updateOrderStatus);

module.exports = router;
