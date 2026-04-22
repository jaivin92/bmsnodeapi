const { query, sql, beginTransaction } = require('../config/database');

// GET /api/canteen/menu
exports.getMenu = async (req, res, next) => {
  try {
    const { category, buildingId } = req.query;
    const bid = buildingId || req.user.BuildingID;
    const inputs = { bid: { type: sql.UniqueIdentifier, value: bid } };
    let where = 'WHERE BuildingID = @bid AND IsAvailable = 1';
    if (category) { where += ' AND Category = @cat'; inputs.cat = { type: sql.NVarChar, value: category }; }

    const result = await query(`SELECT * FROM CanteenMenus ${where} ORDER BY Category, ItemName`, inputs);
    res.json({ success: true, data: result.recordset });
  } catch (err) { next(err); }
};

// POST /api/canteen/menu
exports.addMenuItem = async (req, res, next) => {
  try {
    const { itemName, description, category, price, isVegetarian = false, availableFrom, availableTo, dayOfWeek } = req.body;
    const imageURL = req.file ? `/uploads/documents/${req.file.filename}` : null;

    const result = await query(
      `INSERT INTO CanteenMenus (BuildingID, ItemName, Description, Category, Price, IsVegetarian, ImageURL, AvailableFrom, AvailableTo, DayOfWeek)
       OUTPUT INSERTED.*
       VALUES (@bid, @name, @desc, @cat, @price, @veg, @img, @from, @to, @day)`,
      {
        bid:   { type: sql.UniqueIdentifier, value: req.user.BuildingID },
        name:  { type: sql.NVarChar, value: itemName },
        desc:  { type: sql.NVarChar, value: description || null },
        cat:   { type: sql.NVarChar, value: category },
        price: { type: sql.Decimal, value: price },
        veg:   { type: sql.Bit, value: isVegetarian ? 1 : 0 },
        img:   { type: sql.NVarChar, value: imageURL },
        from:  { type: sql.Time, value: availableFrom || null },
        to:    { type: sql.Time, value: availableTo || null },
        day:   { type: sql.NVarChar, value: dayOfWeek || null },
      }
    );
    res.status(201).json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};

// PUT /api/canteen/menu/:id
exports.updateMenuItem = async (req, res, next) => {
  try {
    const { itemName, price, isAvailable, category, description } = req.body;
    const result = await query(
      `UPDATE CanteenMenus SET ItemName=@name, Price=@price, IsAvailable=@avail, Category=@cat, Description=@desc, UpdatedAt=GETUTCDATE()
       OUTPUT INSERTED.* WHERE MenuID = @id AND BuildingID = @bid`,
      {
        name:  { type: sql.NVarChar, value: itemName },
        price: { type: sql.Decimal, value: price },
        avail: { type: sql.Bit, value: isAvailable !== undefined ? (isAvailable ? 1 : 0) : 1 },
        cat:   { type: sql.NVarChar, value: category },
        desc:  { type: sql.NVarChar, value: description || null },
        id:    { type: sql.UniqueIdentifier, value: req.params.id },
        bid:   { type: sql.UniqueIdentifier, value: req.user.BuildingID },
      }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Menu item not found' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};

// POST /api/canteen/orders
exports.placeOrder = async (req, res, next) => {
  try {
    const { items, deliveryTime, specialInstructions } = req.body;
    // items: [{ menuId, quantity }]

    // Validate items and compute total
    let totalAmount = 0;
    const enrichedItems = [];
    for (const item of items) {
      const menuResult = await query(
        'SELECT * FROM CanteenMenus WHERE MenuID = @id AND IsAvailable = 1',
        { id: { type: sql.UniqueIdentifier, value: item.menuId } }
      );
      if (!menuResult.recordset.length) {
        return res.status(400).json({ success: false, message: `Menu item ${item.menuId} not available` });
      }
      const menuItem = menuResult.recordset[0];
      const lineTotal = menuItem.Price * item.quantity;
      totalAmount += lineTotal;
      enrichedItems.push({ ...menuItem, quantity: item.quantity, lineTotal });
    }

    const transaction = await beginTransaction();
    try {
      const req2 = transaction.request();
      req2.input('bid',    sql.UniqueIdentifier, req.user.BuildingID);
      req2.input('uid',    sql.UniqueIdentifier, req.user.UserID);
      req2.input('unitId', sql.UniqueIdentifier, req.user.UnitID || null);
      req2.input('total',  sql.Decimal, totalAmount);
      req2.input('delTime',sql.Time, deliveryTime || null);
      req2.input('notes',  sql.NVarChar, specialInstructions || null);
      const orderResult = await req2.query(`
        INSERT INTO CanteenOrders (BuildingID, UserID, UnitID, TotalAmount, DeliveryTime, SpecialInstructions)
        OUTPUT INSERTED.OrderID
        VALUES (@bid, @uid, @unitId, @total, @delTime, @notes)
      `);
      const orderId = orderResult.recordset[0].OrderID;

      for (const item of enrichedItems) {
        const req3 = transaction.request();
        req3.input('orderId',   sql.UniqueIdentifier, orderId);
        req3.input('menuId',    sql.UniqueIdentifier, item.MenuID);
        req3.input('qty',       sql.Int, item.quantity);
        req3.input('unitPrice', sql.Decimal, item.Price);
        req3.input('total',     sql.Decimal, item.lineTotal);
        await req3.query(`
          INSERT INTO CanteenOrderItems (OrderID, MenuID, Quantity, UnitPrice, TotalPrice)
          VALUES (@orderId, @menuId, @qty, @unitPrice, @total)
        `);
      }

      await transaction.commit();
      res.status(201).json({ success: true, message: 'Order placed', data: { orderId, totalAmount, items: enrichedItems.length } });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// GET /api/canteen/orders
exports.getOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, date } = req.query;
    const offset = (page - 1) * limit;
    const inputs = {};
    let where = 'WHERE 1=1';

    if (req.user.Role === 'Resident' || req.user.Role === 'Tenant') {
      where += ' AND o.UserID = @uid';
      inputs.uid = { type: sql.UniqueIdentifier, value: req.user.UserID };
    } else {
      where += ' AND o.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    }
    if (status) { where += ' AND o.OrderStatus = @status'; inputs.status = { type: sql.NVarChar, value: status }; }
    if (date)   { where += ' AND o.OrderDate = @date';     inputs.date   = { type: sql.Date, value: date }; }

    inputs.offset = { type: sql.Int, value: offset };
    inputs.limit  = { type: sql.Int, value: parseInt(limit) };

    const result = await query(
      `SELECT o.*, u.FullName AS ResidentName, un.UnitNumber
       FROM CanteenOrders o
       JOIN Users u         ON o.UserID = u.UserID
       LEFT JOIN Units un   ON o.UnitID = un.UnitID
       ${where}
       ORDER BY o.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      inputs
    );
    res.json({ success: true, data: result.recordset });
  } catch (err) { next(err); }
};

// PUT /api/canteen/orders/:id/status
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const result = await query(
      `UPDATE CanteenOrders SET OrderStatus = @status, UpdatedAt = GETUTCDATE()
       OUTPUT INSERTED.* WHERE OrderID = @id AND BuildingID = @bid`,
      {
        status: { type: sql.NVarChar, value: status },
        id:     { type: sql.UniqueIdentifier, value: req.params.id },
        bid:    { type: sql.UniqueIdentifier, value: req.user.BuildingID },
      }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, message: 'Order status updated', data: result.recordset[0] });
  } catch (err) { next(err); }
};
