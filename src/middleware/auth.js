const jwt = require('jsonwebtoken');
const { query, sql } = require('../config/database');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Access token required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user data
    const result = await query(
      `SELECT u.UserID, u.Email, u.FullName, u.Role, u.BuildingID, u.UnitID,
              u.IsActive, u.IsVerified, b.BuildingName
       FROM Users u
       LEFT JOIN Buildings b ON u.BuildingID = b.BuildingID
       WHERE u.UserID = @userId AND u.IsActive = 1`,
      { userId: { type: sql.UniqueIdentifier, value: decoded.userId } }
    );

    if (!result.recordset.length) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated' });
    }

    req.user = result.recordset[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    next(err);
  }
};

// Role-based access control factory
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    if (!roles.includes(req.user.Role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}`
      });
    }
    next();
  };
};

// Optional auth (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        'SELECT UserID, Email, FullName, Role, BuildingID FROM Users WHERE UserID = @userId AND IsActive = 1',
        { userId: { type: sql.UniqueIdentifier, value: decoded.userId } }
      );
      if (result.recordset.length) req.user = result.recordset[0];
    }
  } catch { /* ignore */ }
  next();
};

module.exports = { authenticate, authorize, optionalAuth };
