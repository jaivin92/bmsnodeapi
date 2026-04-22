const { query, sql } = require('../config/database');

// GET /api/buildings
exports.getBuildings = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, type, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE b.IsActive = 1';
    const inputs = {};
    if (type) { whereClause += ' AND b.BuildingType = @type'; inputs.type = { type: sql.NVarChar, value: type }; }
    if (search) { whereClause += ' AND (b.BuildingName LIKE @search OR b.City LIKE @search)'; inputs.search = { type: sql.NVarChar, value: `%${search}%` }; }

    // Super admin sees all; building admin sees their own
    if (req.user.Role === 'BuildingAdmin') {
      whereClause += ' AND b.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    }

    const countResult = await query(`SELECT COUNT(*) AS Total FROM Buildings b ${whereClause}`, inputs);
    const total = countResult.recordset[0].Total;

    inputs.offset = { type: sql.Int, value: offset };
    inputs.limit  = { type: sql.Int, value: parseInt(limit) };

    const result = await query(
      `SELECT b.*, 
              (SELECT COUNT(*) FROM Units u WHERE u.BuildingID = b.BuildingID AND u.IsActive = 1) AS TotalUnits,
              (SELECT COUNT(*) FROM Units u WHERE u.BuildingID = b.BuildingID AND u.Status = 'Occupied') AS OccupiedUnits
       FROM Buildings b ${whereClause}
       ORDER BY b.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      inputs
    );

    res.json({ success: true, data: result.recordset, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

// GET /api/buildings/:id
exports.getBuildingById = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.*,
              (SELECT COUNT(*) FROM Units u WHERE u.BuildingID = b.BuildingID) AS TotalUnits,
              (SELECT COUNT(*) FROM Users u WHERE u.BuildingID = b.BuildingID AND u.IsActive = 1) AS TotalResidents
       FROM Buildings b WHERE b.BuildingID = @id AND b.IsActive = 1`,
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Building not found' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};

// POST /api/buildings
exports.createBuilding = async (req, res, next) => {
  try {
    const { buildingName, buildingType, address, city, state, zipCode, country = 'USA', totalFloors, phone, email } = req.body;

    const result = await query(
      `INSERT INTO Buildings (BuildingName, BuildingType, Address, City, State, ZipCode, Country, TotalFloors, Phone, Email)
       OUTPUT INSERTED.*
       VALUES (@name, @type, @address, @city, @state, @zip, @country, @floors, @phone, @email)`,
      {
        name:    { type: sql.NVarChar, value: buildingName },
        type:    { type: sql.NVarChar, value: buildingType },
        address: { type: sql.NVarChar, value: address },
        city:    { type: sql.NVarChar, value: city },
        state:   { type: sql.NVarChar, value: state },
        zip:     { type: sql.NVarChar, value: zipCode },
        country: { type: sql.NVarChar, value: country },
        floors:  { type: sql.Int,      value: totalFloors || 1 },
        phone:   { type: sql.NVarChar, value: phone || null },
        email:   { type: sql.NVarChar, value: email || null },
      }
    );
    res.status(201).json({ success: true, message: 'Building created', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// PUT /api/buildings/:id
exports.updateBuilding = async (req, res, next) => {
  try {
    const { buildingName, address, city, state, zipCode, phone, email, totalFloors } = req.body;
    const result = await query(
      `UPDATE Buildings SET BuildingName=@name, Address=@address, City=@city, State=@state,
       ZipCode=@zip, Phone=@phone, Email=@email, TotalFloors=@floors, UpdatedAt=GETUTCDATE()
       OUTPUT INSERTED.* WHERE BuildingID = @id`,
      {
        name:    { type: sql.NVarChar, value: buildingName },
        address: { type: sql.NVarChar, value: address },
        city:    { type: sql.NVarChar, value: city },
        state:   { type: sql.NVarChar, value: state },
        zip:     { type: sql.NVarChar, value: zipCode },
        phone:   { type: sql.NVarChar, value: phone || null },
        email:   { type: sql.NVarChar, value: email || null },
        floors:  { type: sql.Int,      value: totalFloors },
        id:      { type: sql.UniqueIdentifier, value: req.params.id },
      }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Building not found' });
    res.json({ success: true, message: 'Building updated', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// DELETE /api/buildings/:id
exports.deleteBuilding = async (req, res, next) => {
  try {
    await query(
      'UPDATE Buildings SET IsActive = 0, UpdatedAt = GETUTCDATE() WHERE BuildingID = @id',
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    res.json({ success: true, message: 'Building deactivated' });
  } catch (err) { next(err); }
};

// ── WINGS ────────────────────────────────────────────────────────────────────
exports.getWings = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM Wings WHERE BuildingID = @bid AND IsActive = 1',
      { bid: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    res.json({ success: true, data: result.recordset });
  } catch (err) { next(err); }
};

exports.addWing = async (req, res, next) => {
  try {
    const { wingName, totalFloors } = req.body;
    const result = await query(
      'INSERT INTO Wings (BuildingID, WingName, TotalFloors) OUTPUT INSERTED.* VALUES (@bid, @name, @floors)',
      {
        bid:    { type: sql.UniqueIdentifier, value: req.params.id },
        name:   { type: sql.NVarChar, value: wingName },
        floors: { type: sql.Int, value: totalFloors || 1 },
      }
    );
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};

// ── UNITS ─────────────────────────────────────────────────────────────────────
exports.getUnits = async (req, res, next) => {
  try {
    const { status, floor, wingId } = req.query;
    let where = 'WHERE u.BuildingID = @bid AND u.IsActive = 1';
    const inputs = { bid: { type: sql.UniqueIdentifier, value: req.params.id } };
    if (status) { where += ' AND u.Status = @status'; inputs.status = { type: sql.NVarChar, value: status }; }
    if (floor)  { where += ' AND u.Floor = @floor';   inputs.floor  = { type: sql.Int, value: parseInt(floor) }; }
    if (wingId) { where += ' AND u.WingID = @wingId'; inputs.wingId = { type: sql.UniqueIdentifier, value: wingId }; }

    const result = await query(
      `SELECT u.*, w.WingName,
              usr.FullName AS ResidentName, usr.Email AS ResidentEmail
       FROM Units u
       LEFT JOIN Wings w   ON u.WingID = w.WingID
       LEFT JOIN Users usr ON usr.UnitID = u.UnitID AND usr.IsActive = 1
       ${where} ORDER BY u.Floor, u.UnitNumber`,
      inputs
    );
    res.json({ success: true, data: result.recordset });
  } catch (err) { next(err); }
};

exports.createUnit = async (req, res, next) => {
  try {
    const { unitNumber, floor, unitType, wingId, areaSqFt, bedrooms, bathrooms, monthlyRent, securityDeposit } = req.body;
    const result = await query(
      `INSERT INTO Units (BuildingID, WingID, UnitNumber, Floor, UnitType, AreaSqFt, Bedrooms, Bathrooms, MonthlyRent, SecurityDeposit)
       OUTPUT INSERTED.* VALUES (@bid, @wingId, @num, @floor, @type, @area, @beds, @baths, @rent, @deposit)`,
      {
        bid:     { type: sql.UniqueIdentifier, value: req.params.id },
        wingId:  { type: sql.UniqueIdentifier, value: wingId || null },
        num:     { type: sql.NVarChar, value: unitNumber },
        floor:   { type: sql.Int, value: floor },
        type:    { type: sql.NVarChar, value: unitType },
        area:    { type: sql.Decimal, value: areaSqFt || null },
        beds:    { type: sql.Int, value: bedrooms || 0 },
        baths:   { type: sql.Int, value: bathrooms || 0 },
        rent:    { type: sql.Decimal, value: monthlyRent || null },
        deposit: { type: sql.Decimal, value: securityDeposit || null },
      }
    );
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};
