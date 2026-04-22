const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, sql } = require('../config/database');
const logger = require('../config/logger');

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  return { accessToken, refreshToken };
};

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { email, password, fullName, phone, role = 'Resident', buildingId, unitId } = req.body;

    // Check existing user
    const existing = await query(
      'SELECT UserID FROM Users WHERE Email = @email',
      { email: { type: sql.NVarChar, value: email.toLowerCase() } }
    );
    if (existing.recordset.length) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = uuidv4();

    await query(
      `INSERT INTO Users (Email, PasswordHash, FullName, Phone, Role, BuildingID, UnitID, VerificationToken)
       VALUES (@email, @passwordHash, @fullName, @phone, @role, @buildingId, @unitId, @token)`,
      {
        email:         { type: sql.NVarChar, value: email.toLowerCase() },
        passwordHash:  { type: sql.NVarChar, value: passwordHash },
        fullName:      { type: sql.NVarChar, value: fullName },
        phone:         { type: sql.NVarChar, value: phone || null },
        role:          { type: sql.NVarChar, value: role },
        buildingId:    { type: sql.UniqueIdentifier, value: buildingId || null },
        unitId:        { type: sql.UniqueIdentifier, value: unitId || null },
        token:         { type: sql.NVarChar, value: verificationToken },
      }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      verificationToken // In production, send via email only
    });
  } catch (err) { next(err); }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await query(
      `SELECT UserID, Email, PasswordHash, FullName, Role, BuildingID, UnitID, IsActive, IsVerified
       FROM Users WHERE Email = @email`,
      { email: { type: sql.NVarChar, value: email.toLowerCase() } }
    );

    const user = result.recordset[0];
    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!user.IsActive) return res.status(403).json({ success: false, message: 'Account deactivated' });

    const isMatch = await bcrypt.compare(password, user.PasswordHash);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    const { accessToken, refreshToken } = generateTokens(user.UserID, user.Role);

    // Update last login
    await query(
      'UPDATE Users SET LastLogin = GETUTCDATE() WHERE UserID = @id',
      { id: { type: sql.UniqueIdentifier, value: user.UserID } }
    );

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.UserID,
          email: user.Email,
          fullName: user.FullName,
          role: user.Role,
          buildingId: user.BuildingID,
          unitId: user.UnitID,
          isVerified: user.IsVerified
        }
      }
    });
  } catch (err) { next(err); }
};

// POST /api/auth/refresh
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const result = await query(
      'SELECT UserID, Role, IsActive FROM Users WHERE UserID = @id',
      { id: { type: sql.UniqueIdentifier, value: decoded.userId } }
    );

    const user = result.recordset[0];
    if (!user || !user.IsActive) return res.status(401).json({ success: false, message: 'Invalid token' });

    const tokens = generateTokens(user.UserID, user.Role);
    res.json({ success: true, data: tokens });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
    }
    next(err);
  }
};

// POST /api/auth/verify-email
exports.verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;
    const result = await query(
      'UPDATE Users SET IsVerified = 1, VerificationToken = NULL WHERE VerificationToken = @token',
      { token: { type: sql.NVarChar, value: token } }
    );
    if (!result.rowsAffected[0]) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const resetToken = uuidv4();
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    await query(
      'UPDATE Users SET ResetToken = @token, ResetTokenExpiry = @expiry WHERE Email = @email AND IsActive = 1',
      {
        token:  { type: sql.NVarChar, value: resetToken },
        expiry: { type: sql.DateTime2, value: expiry },
        email:  { type: sql.NVarChar, value: email.toLowerCase() }
      }
    );

    // Always return success to prevent email enumeration
    res.json({ success: true, message: 'If the email exists, a reset link has been sent', resetToken });
  } catch (err) { next(err); }
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const result = await query(
      `UPDATE Users SET PasswordHash = @hash, ResetToken = NULL, ResetTokenExpiry = NULL
       WHERE ResetToken = @token AND ResetTokenExpiry > GETUTCDATE()`,
      {
        hash:  { type: sql.NVarChar, value: passwordHash },
        token: { type: sql.NVarChar, value: token }
      }
    );

    if (!result.rowsAffected[0]) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }
    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) { next(err); }
};

// GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ success: true, data: req.user });
};

// PUT /api/auth/change-password
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const result = await query(
      'SELECT PasswordHash FROM Users WHERE UserID = @id',
      { id: { type: sql.UniqueIdentifier, value: req.user.UserID } }
    );

    const isMatch = await bcrypt.compare(currentPassword, result.recordset[0].PasswordHash);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 12);
    await query(
      'UPDATE Users SET PasswordHash = @hash, UpdatedAt = GETUTCDATE() WHERE UserID = @id',
      {
        hash: { type: sql.NVarChar, value: hash },
        id:   { type: sql.UniqueIdentifier, value: req.user.UserID }
      }
    );
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) { next(err); }
};
