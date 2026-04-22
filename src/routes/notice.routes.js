const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { documentUpload } = require('../middleware/upload');
const ctrl = require('../controllers/notice.controller');

router.use(authenticate);

router.get('/',      ctrl.getNotices);
router.post('/',     authorize('SuperAdmin','BuildingAdmin'), documentUpload.single('attachment'), ctrl.createNotice);
router.put('/:id',   authorize('SuperAdmin','BuildingAdmin'), ctrl.updateNotice);
router.delete('/:id',authorize('SuperAdmin','BuildingAdmin'), ctrl.deleteNotice);

module.exports = router;
