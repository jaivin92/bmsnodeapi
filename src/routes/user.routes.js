const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { profileUpload } = require('../middleware/upload');
const ctrl = require('../controllers/user.controller');

router.use(authenticate);

router.get('/',      authorize('SuperAdmin','BuildingAdmin'), ctrl.getUsers);
router.post('/',     authorize('SuperAdmin','BuildingAdmin'), ctrl.createUser);
router.get('/:id',   ctrl.getUserById);
router.put('/:id',   profileUpload.single('photo'), ctrl.updateUser);
router.delete('/:id',authorize('SuperAdmin','BuildingAdmin'), ctrl.deleteUser);

module.exports = router;
