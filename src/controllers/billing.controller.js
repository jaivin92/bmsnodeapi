const { query, sql, beginTransaction } = require('../config/database');

// GET /api/billing - Get bills
exports.getBills = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, type, unitId, buildingId } = req.query;
    const offset = (page - 1) * limit;
    const inputs = {};
    let where = 'WHERE 1=1';

    // Scope by role
    if (req.user.Role === 'Resident' || req.user.Role === 'Tenant') {
      where += ' AND b.UserID = @userId';
      inputs.userId = { type: sql.UniqueIdentifier, value: req.user.UserID };
    } else if (req.user.Role === 'BuildingAdmin') {
      where += ' AND b.BuildingID = @buildingId';
      inputs.buildingId = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    } else if (buildingId) {
      where += ' AND b.BuildingID = @buildingId';
      inputs.buildingId = { type: sql.UniqueIdentifier, value: buildingId };
    }

    if (status) { where += ' AND b.PaymentStatus = @status'; inputs.status = { type: sql.NVarChar, value: status }; }
    if (type)   { where += ' AND b.BillType = @type';        inputs.type   = { type: sql.NVarChar, value: type };   }
    if (unitId) { where += ' AND b.UnitID = @unitId';        inputs.unitId = { type: sql.UniqueIdentifier, value: unitId }; }

    const countResult = await query(`SELECT COUNT(*) AS Total FROM Bills b ${where}`, inputs);
    const total = countResult.recordset[0].Total;

    inputs.offset = { type: sql.Int, value: offset };
    inputs.limit  = { type: sql.Int, value: parseInt(limit) };

    const result = await query(
      `SELECT b.*, u.UnitNumber, u.Floor, usr.FullName AS ResidentName,
              bld.BuildingName
       FROM Bills b
       LEFT JOIN Units u       ON b.UnitID = u.UnitID
       LEFT JOIN Users usr     ON b.UserID = usr.UserID
       LEFT JOIN Buildings bld ON b.BuildingID = bld.BuildingID
       ${where}
       ORDER BY b.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      inputs
    );

    res.json({ success: true, data: result.recordset, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
};

// GET /api/billing/:id
exports.getBillById = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT b.*, u.UnitNumber, usr.FullName AS ResidentName, usr.Email AS ResidentEmail,
              bld.BuildingName, cb.FullName AS CreatedByName
       FROM Bills b
       LEFT JOIN Units u       ON b.UnitID = u.UnitID
       LEFT JOIN Users usr     ON b.UserID = usr.UserID
       LEFT JOIN Buildings bld ON b.BuildingID = bld.BuildingID
       LEFT JOIN Users cb      ON b.CreatedBy = cb.UserID
       WHERE b.BillID = @id`,
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Bill not found' });
    
    // Fetch transactions
    const txResult = await query(
      'SELECT * FROM PaymentTransactions WHERE BillID = @id ORDER BY CreatedAt DESC',
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );

    res.json({ success: true, data: { ...result.recordset[0], transactions: txResult.recordset } });
  } catch (err) { next(err); }
};

// POST /api/billing - Create bill
exports.createBill = async (req, res, next) => {
  try {
    const { buildingId, unitId, userId, billType, billMonth, amount, taxAmount = 0, dueDate, description, notes } = req.body;
    const totalAmount = parseFloat(amount) + parseFloat(taxAmount);
    const fileURL = req.file ? `/uploads/bills/${req.file.filename}` : null;

    const result = await query(
      `INSERT INTO Bills (BuildingID, UnitID, UserID, BillType, BillMonth, Amount, TaxAmount, TotalAmount, DueDate, FileURL, Description, Notes, CreatedBy)
       OUTPUT INSERTED.*
       VALUES (@bid, @uid, @userId, @type, @month, @amount, @tax, @total, @due, @file, @desc, @notes, @createdBy)`,
      {
        bid:       { type: sql.UniqueIdentifier, value: buildingId },
        uid:       { type: sql.UniqueIdentifier, value: unitId || null },
        userId:    { type: sql.UniqueIdentifier, value: userId || null },
        type:      { type: sql.NVarChar, value: billType },
        month:     { type: sql.Date, value: billMonth },
        amount:    { type: sql.Decimal, value: amount },
        tax:       { type: sql.Decimal, value: taxAmount },
        total:     { type: sql.Decimal, value: totalAmount },
        due:       { type: sql.Date, value: dueDate },
        file:      { type: sql.NVarChar, value: fileURL },
        desc:      { type: sql.NVarChar, value: description || null },
        notes:     { type: sql.NVarChar, value: notes || null },
        createdBy: { type: sql.UniqueIdentifier, value: req.user.UserID },
      }
    );

    res.status(201).json({ success: true, message: 'Bill created', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// POST /api/billing/:id/pay - Process payment
exports.payBill = async (req, res, next) => {
  try {
    const { paymentMethod, transactionRef, amount } = req.body;
    const billId = req.params.id;

    const billResult = await query(
      'SELECT * FROM Bills WHERE BillID = @id',
      { id: { type: sql.UniqueIdentifier, value: billId } }
    );
    if (!billResult.recordset.length) return res.status(404).json({ success: false, message: 'Bill not found' });

    const bill = billResult.recordset[0];
    const payAmount = parseFloat(amount) || bill.TotalAmount;
    const newPaidAmount = parseFloat(bill.PaidAmount || 0) + payAmount;
    const newStatus = newPaidAmount >= bill.TotalAmount ? 'Paid' : 'Partial';

    const transaction = await beginTransaction();
    try {
      const req2 = transaction.request();
      req2.input('billId', sql.UniqueIdentifier, billId);
      req2.input('paid', sql.Decimal, newPaidAmount);
      req2.input('status', sql.NVarChar, newStatus);
      await req2.query(`
        UPDATE Bills SET PaidAmount = @paid, PaymentStatus = @status, PaidAt = GETUTCDATE(), UpdatedAt = GETUTCDATE()
        WHERE BillID = @billId
      `);

      const req3 = transaction.request();
      req3.input('billId',  sql.UniqueIdentifier, billId);
      req3.input('userId',  sql.UniqueIdentifier, req.user.UserID);
      req3.input('amount',  sql.Decimal, payAmount);
      req3.input('method',  sql.NVarChar, paymentMethod);
      req3.input('ref',     sql.NVarChar, transactionRef || `TXN-${Date.now()}`);
      req3.input('status',  sql.NVarChar, 'Success');
      await req3.query(`
        INSERT INTO PaymentTransactions (BillID, UserID, Amount, PaymentMethod, TransactionRef, Status)
        VALUES (@billId, @userId, @amount, @method, @ref, @status)
      `);

      await transaction.commit();
      res.json({ success: true, message: 'Payment recorded', data: { status: newStatus, paidAmount: newPaidAmount } });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// GET /api/billing/summary - Summary for dashboard
exports.getBillingSummary = async (req, res, next) => {
  try {
    const buildingId = req.user.BuildingID || req.query.buildingId;
    const inputs = {};
    let where = 'WHERE 1=1';
    if (buildingId) { where += ' AND BuildingID = @bid'; inputs.bid = { type: sql.UniqueIdentifier, value: buildingId }; }

    const result = await query(
      `SELECT
        SUM(TotalAmount) AS TotalBilled,
        SUM(PaidAmount) AS TotalCollected,
        SUM(TotalAmount - PaidAmount) AS TotalPending,
        COUNT(*) AS TotalBills,
        SUM(CASE WHEN PaymentStatus = 'Overdue' THEN 1 ELSE 0 END) AS OverdueBills,
        SUM(CASE WHEN PaymentStatus = 'Paid' THEN 1 ELSE 0 END) AS PaidBills
       FROM Bills ${where}`,
      inputs
    );
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};
