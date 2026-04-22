const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/building.controller');

router.use(authenticate);

router.get('/',        authorize('SuperAdmin','BuildingAdmin'), ctrl.getBuildings);
router.post('/',       authorize('SuperAdmin'), ctrl.createBuilding);
router.get('/:id',     ctrl.getBuildingById);
router.put('/:id',     authorize('SuperAdmin','BuildingAdmin'), ctrl.updateBuilding);
router.delete('/:id',  authorize('SuperAdmin'), ctrl.deleteBuilding);

// Wings
router.get('/:id/wings',  ctrl.getWings);
router.post('/:id/wings', authorize('SuperAdmin','BuildingAdmin'), ctrl.addWing);

// Units
router.get('/:id/units',  ctrl.getUnits);
router.post('/:id/units', authorize('SuperAdmin','BuildingAdmin'), ctrl.createUnit);

module.exports = router;
