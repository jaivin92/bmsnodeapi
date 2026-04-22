const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/voting.controller');

router.use(authenticate);

router.get('/',         ctrl.getPolls);
router.post('/',        authorize('SuperAdmin','BuildingAdmin'), ctrl.createPoll);
router.get('/:id',      ctrl.getPollById);
router.post('/:id/vote',ctrl.castVote);
router.put('/:id/close',authorize('SuperAdmin','BuildingAdmin'), ctrl.closePoll);

module.exports = router;
