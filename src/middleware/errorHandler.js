const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    user: req.user ? req.user.UserID : 'anonymous'
  });

  // SQL Server errors
  if (err.number) {
    switch (err.number) {
      case 2627: // Unique constraint violation
      case 2601:
        return res.status(409).json({ success: false, message: 'Duplicate entry. Record already exists.' });
      case 547:  // Foreign key violation
        return res.status(400).json({ success: false, message: 'Invalid reference. Related record not found.' });
      case 515:  // Cannot insert NULL
        return res.status(400).json({ success: false, message: 'Required field missing.' });
      default:
        return res.status(500).json({ success: false, message: 'Database error occurred.' });
    }
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message, errors: err.errors });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'File too large. Maximum size is 10MB.' });
  }

  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
