const { query, sql } = require('../config/database');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

// GET /api/visitors
exports.getVisitors = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, buildingId, date } = req.query;
    const offset = (page - 1) * limit;
    const inputs = {};
    let where = 'WHERE 1=1';

    if (req.user.Role === 'Resident' || req.user.Role === 'Tenant') {
      where += ' AND v.ResidentID = @residentId';
      inputs.residentId = { type: sql.UniqueIdentifier, value: req.user.UserID };
    } else if (req.user.Role === 'BuildingAdmin' || req.user.Role === 'SecurityStaff') {
      where += ' AND v.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    } else if (buildingId) {
      where += ' AND v.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: buildingId };
    }

    if (status) { where += ' AND v.Status = @status'; inputs.status = { type: sql.NVarChar, value: status }; }
    if (date)   { where += ' AND CAST(v.CreatedAt AS DATE) = @date'; inputs.date = { type: sql.Date, value: date }; }

    const countResult = await query(`SELECT COUNT(*) AS Total FROM Visitors v ${where}`, inputs);
    inputs.offset = { type: sql.Int, value: offset };
    inputs.limit  = { type: sql.Int, value: parseInt(limit) };

    const result = await query(
      `SELECT v.*, u.FullName AS ResidentName, u.UnitID, un.UnitNumber
       FROM Visitors v
       JOIN Users u  ON v.ResidentID = u.UserID
       LEFT JOIN Units un ON v.UnitID = un.UnitID
       ${where}
       ORDER BY v.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      inputs
    );

    res.json({ success: true, data: result.recordset, pagination: { total: countResult.recordset[0].Total, page: parseInt(page) } });
  } catch (err) { next(err); }
};

// POST /api/visitors - Pre-register visitor
exports.createVisitor = async (req, res, next) => {
  try {
    const { visitorName, visitorPhone, visitorEmail, purpose, visitorType = 'Personal', expectedArrival, vehicleNumber, notes } = req.body;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 24 * 3600000); // 24 hours
    const qrData = uuidv4();
    const qrCodeURL = await QRCode.toDataURL(qrData);

    const result = await query(
      `INSERT INTO Visitors (BuildingID, ResidentID, UnitID, VisitorName, VisitorPhone, VisitorEmail, Purpose, VisitorType, ExpectedArrival, OTP, OTPExpiry, QRCode, VehicleNumber, Notes)
       OUTPUT INSERTED.*
       VALUES (@bid, @residentId, @unitId, @name, @phone, @email, @purpose, @type, @arrival, @otp, @otpExpiry, @qr, @vehicle, @notes)`,
      {
        bid:       { type: sql.UniqueIdentifier, value: req.user.BuildingID },
        residentId:{ type: sql.UniqueIdentifier, value: req.user.UserID },
        unitId:    { type: sql.UniqueIdentifier, value: req.user.UnitID || null },
        name:      { type: sql.NVarChar, value: visitorName },
        phone:     { type: sql.NVarChar, value: visitorPhone || null },
        email:     { type: sql.NVarChar, value: visitorEmail || null },
        purpose:   { type: sql.NVarChar, value: purpose || null },
        type:      { type: sql.NVarChar, value: visitorType },
        arrival:   { type: sql.DateTime2, value: expectedArrival || null },
        otp:       { type: sql.NVarChar, value: otp },
        otpExpiry: { type: sql.DateTime2, value: otpExpiry },
        qr:        { type: sql.NVarChar, value: qrData },
        vehicle:   { type: sql.NVarChar, value: vehicleNumber || null },
        notes:     { type: sql.NVarChar, value: notes || null },
      }
    );

    res.status(201).json({
      success: true,
      message: 'Visitor pre-registered',
      data: { ...result.recordset[0], otp, qrCodeImage: qrCodeURL }
    });
  } catch (err) { next(err); }
};

// POST /api/visitors/:id/checkin - Security checks in visitor
exports.checkIn = async (req, res, next) => {
  try {
    const { otp, qrCode } = req.body;
    const visitorId = req.params.id;

    let where = 'VisitorID = @id AND Status = @status';
    const inputs = {
      id:     { type: sql.UniqueIdentifier, value: visitorId },
      status: { type: sql.NVarChar, value: 'Expected' },
    };

    if (otp) {
      where += ' AND OTP = @otp AND OTPExpiry > GETUTCDATE()';
      inputs.otp = { type: sql.NVarChar, value: otp };
    } else if (qrCode) {
      where += ' AND QRCode = @qr';
      inputs.qr = { type: sql.NVarChar, value: qrCode };
    }

    const result = await query(
      `UPDATE Visitors SET Status = 'CheckedIn', CheckInTime = GETUTCDATE(), ApprovedBy = @approvedBy, UpdatedAt = GETUTCDATE()
       OUTPUT INSERTED.*
       WHERE ${where}`,
      { ...inputs, approvedBy: { type: sql.UniqueIdentifier, value: req.user.UserID } }
    );

    if (!result.recordset.length) {
      return res.status(400).json({ success: false, message: 'Invalid OTP/QR code or visitor already checked in' });
    }
    res.json({ success: true, message: 'Visitor checked in', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// POST /api/visitors/:id/checkout
exports.checkOut = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE Visitors SET Status = 'CheckedOut', CheckOutTime = GETUTCDATE(), UpdatedAt = GETUTCDATE()
       OUTPUT INSERTED.* WHERE VisitorID = @id AND Status = 'CheckedIn'`,
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    if (!result.recordset.length) return res.status(400).json({ success: false, message: 'Visitor not found or not checked in' });
    res.json({ success: true, message: 'Visitor checked out', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// GET /api/visitors/report
exports.getVisitorReport = async (req, res, next) => {
  try {
    const { from, to, buildingId } = req.query;
    const bid = buildingId || req.user.BuildingID;
    const result = await query(
      `SELECT
        COUNT(*) AS TotalVisitors,
        SUM(CASE WHEN Status = 'CheckedIn' THEN 1 ELSE 0 END) AS CurrentlyIn,
        SUM(CASE WHEN Status = 'CheckedOut' THEN 1 ELSE 0 END) AS CheckedOut,
        SUM(CASE WHEN VisitorType = 'Delivery' THEN 1 ELSE 0 END) AS Deliveries,
        SUM(CASE WHEN CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE) THEN 1 ELSE 0 END) AS TodayVisitors
       FROM Visitors WHERE BuildingID = @bid`,
      { bid: { type: sql.UniqueIdentifier, value: bid } }
    );
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};
