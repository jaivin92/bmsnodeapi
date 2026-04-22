const bcrypt = require('bcryptjs');
const { query, sql } = require('../config/database');

// GET /api/users
exports.getUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, buildingId, unitId, search } = req.query;
    const offset = (page - 1) * limit;
    const inputs = {};
    let where = 'WHERE u.IsActive = 1';

    // Scope: building admin sees only their building users
    if (req.user.Role === 'BuildingAdmin') {
      where += ' AND u.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    } else if (buildingId) {
      where += ' AND u.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: buildingId };
    }

    if (role)   { where += ' AND u.Role = @role';                         inputs.role   = { type: sql.NVarChar, value: role };   }
    if (unitId) { where += ' AND u.UnitID = @unitId';                     inputs.unitId = { type: sql.UniqueIdentifier, value: unitId }; }
    if (search) { where += ' AND (u.FullName LIKE @s OR u.Email LIKE @s)'; inputs.s      = { type: sql.NVarChar, value: `%${search}%` }; }

    const countResult = await query(`SELECT COUNT(*) AS Total FROM Users u ${where}`, inputs);
    inputs.offset = { type: sql.Int, value: offset };
    inputs.limit  = { type: sql.Int, value: parseInt(limit) };

    const result = await query(
      `SELECT u.UserID, u.Email, u.FullName, u.Phone, u.Role, u.IsActive, u.IsVerified,
              u.BuildingID, u.UnitID, u.ProfilePhotoURL, u.IsOwner, u.MoveInDate, u.LastLogin, u.CreatedAt,
              b.BuildingName, un.UnitNumber
       FROM Users u
       LEFT JOIN Buildings b ON u.BuildingID = b.BuildingID
       LEFT JOIN Units un    ON u.UnitID = un.UnitID
       ${where}
       ORDER BY u.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      inputs
    );
    res.json({ success: true, data: result.recordset, pagination: { total: countResult.recordset[0].Total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) { next(err); }
};

// GET /api/users/:id
exports.getUserById = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT u.UserID, u.Email, u.FullName, u.Phone, u.Role, u.IsActive, u.IsVerified,
              u.BuildingID, u.UnitID, u.ProfilePhotoURL, u.IsOwner, u.MoveInDate, u.MoveOutDate,
              u.EmergencyContact, u.EmergencyPhone, u.LastLogin, u.CreatedAt,
              b.BuildingName, un.UnitNumber, un.Floor
       FROM Users u
       LEFT JOIN Buildings b ON u.BuildingID = b.BuildingID
       LEFT JOIN Units un    ON u.UnitID = un.UnitID
       WHERE u.UserID = @id`,
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};

// POST /api/users - Admin creates user
exports.createUser = async (req, res, next) => {
  try {
    const { email, password, fullName, phone, role, buildingId, unitId, isOwner = false, moveInDate } = req.body;

    const existing = await query('SELECT UserID FROM Users WHERE Email = @email', { email: { type: sql.NVarChar, value: email.toLowerCase() } });
    if (existing.recordset.length) return res.status(409).json({ success: false, message: 'Email already exists' });

    const hash = await bcrypt.hash(password || 'Welcome@123', 12);
    const result = await query(
      `INSERT INTO Users (Email, PasswordHash, FullName, Phone, Role, BuildingID, UnitID, IsOwner, IsVerified, MoveInDate)
       OUTPUT INSERTED.UserID, INSERTED.Email, INSERTED.FullName, INSERTED.Role
       VALUES (@email, @hash, @name, @phone, @role, @bid, @uid, @owner, 1, @moveIn)`,
      {
        email:  { type: sql.NVarChar, value: email.toLowerCase() },
        hash:   { type: sql.NVarChar, value: hash },
        name:   { type: sql.NVarChar, value: fullName },
        phone:  { type: sql.NVarChar, value: phone || null },
        role:   { type: sql.NVarChar, value: role },
        bid:    { type: sql.UniqueIdentifier, value: buildingId || null },
        uid:    { type: sql.UniqueIdentifier, value: unitId || null },
        owner:  { type: sql.Bit, value: isOwner ? 1 : 0 },
        moveIn: { type: sql.Date, value: moveInDate || null },
      }
    );

    // Update unit status if assigned
    if (unitId) {
      await query(
        `UPDATE Units SET Status = 'Occupied', UpdatedAt = GETUTCDATE() WHERE UnitID = @uid`,
        { uid: { type: sql.UniqueIdentifier, value: unitId } }
      );
    }

    res.status(201).json({ success: true, message: 'User created. Default password: Welcome@123', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// PUT /api/users/:id
exports.updateUser = async (req, res, next) => {
  try {
    const { fullName, phone, unitId, buildingId, role, isActive, emergencyContact, emergencyPhone, moveInDate, moveOutDate } = req.body;
    const photoURL = req.file ? `/uploads/profiles/${req.file.filename}` : undefined;

    const setClause = [
      'FullName = @name', 'Phone = @phone', 'UnitID = @uid', 'BuildingID = @bid',
      'EmergencyContact = @ec', 'EmergencyPhone = @ep',
      'MoveInDate = @moveIn', 'MoveOutDate = @moveOut',
      'UpdatedAt = GETUTCDATE()',
    ];
    if (photoURL !== undefined) setClause.push('ProfilePhotoURL = @photo');

    // Only super admin can change roles
    const inputs = {
      name:   { type: sql.NVarChar, value: fullName },
      phone:  { type: sql.NVarChar, value: phone || null },
      uid:    { type: sql.UniqueIdentifier, value: unitId || null },
      bid:    { type: sql.UniqueIdentifier, value: buildingId || null },
      ec:     { type: sql.NVarChar, value: emergencyContact || null },
      ep:     { type: sql.NVarChar, value: emergencyPhone || null },
      moveIn: { type: sql.Date, value: moveInDate || null },
      moveOut:{ type: sql.Date, value: moveOutDate || null },
      id:     { type: sql.UniqueIdentifier, value: req.params.id },
    };
    if (photoURL !== undefined) inputs.photo = { type: sql.NVarChar, value: photoURL };
    if (req.user.Role === 'SuperAdmin' && role) {
      setClause.push('Role = @role');
      inputs.role = { type: sql.NVarChar, value: role };
    }
    if (req.user.Role === 'SuperAdmin' && isActive !== undefined) {
      setClause.push('IsActive = @active');
      inputs.active = { type: sql.Bit, value: isActive ? 1 : 0 };
    }

    const result = await query(
      `UPDATE Users SET ${setClause.join(', ')} OUTPUT INSERTED.UserID, INSERTED.FullName, INSERTED.Email, INSERTED.Role WHERE UserID = @id`,
      inputs
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User updated', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// DELETE /api/users/:id (soft delete)
exports.deleteUser = async (req, res, next) => {
  try {
    await query(
      'UPDATE Users SET IsActive = 0, UpdatedAt = GETUTCDATE() WHERE UserID = @id',
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) { next(err); }
};
