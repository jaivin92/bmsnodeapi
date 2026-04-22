const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/parking.controller');

router.use(authenticate);

router.get('/slots',              ctrl.getSlots);
router.post('/slots',             authorize('SuperAdmin','BuildingAdmin'), ctrl.createSlot);
router.get('/bookings',           ctrl.getBookings);
router.post('/book',              ctrl.bookSlot);
router.put('/bookings/:id/cancel',ctrl.cancelBooking);

module.exports = router;
