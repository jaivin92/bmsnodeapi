const { query, sql } = require('../config/database');
const QRCode = require('qrcode');

// GET /api/parking/slots
exports.getSlots = async (req, res, next) => {
  try {
    const { status, slotType } = req.query;
    const bid = req.user.BuildingID || req.query.buildingId;
    const inputs = { bid: { type: sql.UniqueIdentifier, value: bid } };
    let where = 'WHERE p.BuildingID = @bid AND p.IsActive = 1';
    if (status)   { where += ' AND p.Status = @status';   inputs.status   = { type: sql.NVarChar, value: status };   }
    if (slotType) { where += ' AND p.SlotType = @type';   inputs.type     = { type: sql.NVarChar, value: slotType }; }

    const result = await query(
      `SELECT p.*, u.UnitNumber AS AssignedToUnit_UnitNumber
       FROM ParkingSlots p
       LEFT JOIN Units u ON p.AssignedToUnit = u.UnitID
       ${where}
       ORDER BY p.SlotNumber`,
      inputs
    );
    res.json({ success: true, data: result.recordset });
  } catch (err) { next(err); }
};

// POST /api/parking/slots
exports.createSlot = async (req, res, next) => {
  try {
    const { slotNumber, slotType, level, monthlyRate, hourlyRate } = req.body;
    const result = await query(
      `INSERT INTO ParkingSlots (BuildingID, SlotNumber, SlotType, Level, MonthlyRate, HourlyRate)
       OUTPUT INSERTED.*
       VALUES (@bid, @num, @type, @level, @monthly, @hourly)`,
      {
        bid:     { type: sql.UniqueIdentifier, value: req.user.BuildingID },
        num:     { type: sql.NVarChar, value: slotNumber },
        type:    { type: sql.NVarChar, value: slotType },
        level:   { type: sql.NVarChar, value: level || null },
        monthly: { type: sql.Decimal, value: monthlyRate || null },
        hourly:  { type: sql.Decimal, value: hourlyRate || null },
      }
    );
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};

// POST /api/parking/book
exports.bookSlot = async (req, res, next) => {
  try {
    const { slotId, vehicleNumber, vehicleType, bookingType, startTime, endTime } = req.body;

    // Check slot is available
    const slotResult = await query(
      `SELECT * FROM ParkingSlots WHERE SlotID = @id AND Status = 'Available' AND IsActive = 1`,
      { id: { type: sql.UniqueIdentifier, value: slotId } }
    );
    if (!slotResult.recordset.length) {
      return res.status(400).json({ success: false, message: 'Slot not available' });
    }

    const slot = slotResult.recordset[0];
    let amount = 0;
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : null;

    if (bookingType === 'Hourly' && end) {
      const hours = Math.ceil((end - start) / 3600000);
      amount = hours * (slot.HourlyRate || 0);
    } else if (bookingType === 'Monthly') {
      amount = slot.MonthlyRate || 0;
    }

    const qrData = `PARKING-${slotId}-${Date.now()}`;
    const qrCodeURL = await QRCode.toDataURL(qrData);

    const result = await query(
      `INSERT INTO ParkingBookings (SlotID, UserID, VehicleNumber, VehicleType, BookingType, StartTime, EndTime, Amount, QRCode)
       OUTPUT INSERTED.*
       VALUES (@slotId, @userId, @vehicle, @vtype, @btype, @start, @end, @amount, @qr)`,
      {
        slotId:  { type: sql.UniqueIdentifier, value: slotId },
        userId:  { type: sql.UniqueIdentifier, value: req.user.UserID },
        vehicle: { type: sql.NVarChar, value: vehicleNumber },
        vtype:   { type: sql.NVarChar, value: vehicleType },
        btype:   { type: sql.NVarChar, value: bookingType },
        start:   { type: sql.DateTime2, value: start },
        end:     { type: sql.DateTime2, value: end },
        amount:  { type: sql.Decimal, value: amount },
        qr:      { type: sql.NVarChar, value: qrData },
      }
    );

    // Mark slot as occupied
    await query(
      `UPDATE ParkingSlots SET Status = 'Occupied' WHERE SlotID = @id`,
      { id: { type: sql.UniqueIdentifier, value: slotId } }
    );

    res.status(201).json({ success: true, message: 'Parking booked', data: { ...result.recordset[0], qrCodeImage: qrCodeURL } });
  } catch (err) { next(err); }
};

// GET /api/parking/bookings
exports.getBookings = async (req, res, next) => {
  try {
    const inputs = {};
    let where = 'WHERE 1=1';
    if (req.user.Role === 'Resident' || req.user.Role === 'Tenant') {
      where += ' AND pb.UserID = @uid';
      inputs.uid = { type: sql.UniqueIdentifier, value: req.user.UserID };
    } else {
      where += ' AND ps.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    }

    const result = await query(
      `SELECT pb.*, ps.SlotNumber, ps.SlotType, ps.Level, u.FullName AS ResidentName
       FROM ParkingBookings pb
       JOIN ParkingSlots ps ON pb.SlotID = ps.SlotID
       JOIN Users u         ON pb.UserID = u.UserID
       ${where}
       ORDER BY pb.CreatedAt DESC`,
      inputs
    );
    res.json({ success: true, data: result.recordset });
  } catch (err) { next(err); }
};

// PUT /api/parking/bookings/:id/cancel
exports.cancelBooking = async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE ParkingBookings SET Status = 'Cancelled'
       OUTPUT INSERTED.SlotID
       WHERE BookingID = @id AND UserID = @uid AND Status = 'Active'`,
      {
        id:  { type: sql.UniqueIdentifier, value: req.params.id },
        uid: { type: sql.UniqueIdentifier, value: req.user.UserID },
      }
    );
    if (!result.recordset.length) return res.status(400).json({ success: false, message: 'Booking not found or already cancelled' });

    // Free up the slot
    await query(
      `UPDATE ParkingSlots SET Status = 'Available' WHERE SlotID = @id`,
      { id: { type: sql.UniqueIdentifier, value: result.recordset[0].SlotID } }
    );
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err) { next(err); }
};
