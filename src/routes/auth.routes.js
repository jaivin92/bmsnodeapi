const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Min 8 characters'),
  body('fullName').notEmpty().trim(),
  validate,
], ctrl.register);

router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
], ctrl.login);

router.post('/refresh',        ctrl.refreshToken);
router.post('/verify-email',   ctrl.verifyEmail);
router.post('/forgot-password',[body('email').isEmail(), validate], ctrl.forgotPassword);
router.post('/reset-password', [body('token').notEmpty(), body('newPassword').isLength({ min: 8 }), validate], ctrl.resetPassword);
router.get('/me',              authenticate, ctrl.getMe);
router.put('/change-password', authenticate, [body('currentPassword').notEmpty(), body('newPassword').isLength({ min: 8 }), validate], ctrl.changePassword);

module.exports = router;
