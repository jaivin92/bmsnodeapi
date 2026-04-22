const { query, sql } = require('../config/database');

// GET /api/dashboard/super-admin
exports.getSuperAdminDashboard = async (req, res, next) => {
  try {
    const [buildings, users, billing, complaints, visitors] = await Promise.all([
      query(`SELECT
               COUNT(*) AS Total,
               SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS Active,
               SUM(CASE WHEN BuildingType = 'Residential' THEN 1 ELSE 0 END) AS Residential,
               SUM(CASE WHEN BuildingType = 'Commercial' THEN 1 ELSE 0 END) AS Commercial
             FROM Buildings`),
      query(`SELECT
               COUNT(*) AS Total,
               SUM(CASE WHEN Role IN ('Resident','Tenant') THEN 1 ELSE 0 END) AS Residents,
               SUM(CASE WHEN Role = 'BuildingAdmin' THEN 1 ELSE 0 END) AS Admins,
               SUM(CASE WHEN CreatedAt >= DATEADD(DAY,-30,GETUTCDATE()) THEN 1 ELSE 0 END) AS NewThisMonth
             FROM Users WHERE IsActive = 1`),
      query(`SELECT
               SUM(TotalAmount) AS TotalBilled,
               SUM(PaidAmount) AS TotalCollected,
               SUM(TotalAmount - PaidAmount) AS Outstanding,
               SUM(CASE WHEN PaymentStatus = 'Overdue' THEN TotalAmount - PaidAmount ELSE 0 END) AS OverdueAmount
             FROM Bills`),
      query(`SELECT
               COUNT(*) AS Total,
               SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) AS Open,
               SUM(CASE WHEN Status = 'InProgress' THEN 1 ELSE 0 END) AS InProgress,
               SUM(CASE WHEN Priority = 'Emergency' AND Status NOT IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS Emergencies
             FROM Complaints`),
      query(`SELECT
               COUNT(*) AS TodayTotal,
               SUM(CASE WHEN Status = 'CheckedIn' THEN 1 ELSE 0 END) AS CurrentlyIn
             FROM Visitors
             WHERE CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE)`),
    ]);

    // Monthly revenue trend (last 6 months)
    const revenueTrend = await query(`
      SELECT FORMAT(BillMonth, 'MMM yyyy') AS Month, SUM(PaidAmount) AS Revenue
      FROM Bills
      WHERE BillMonth >= DATEADD(MONTH, -6, GETUTCDATE())
      GROUP BY FORMAT(BillMonth, 'MMM yyyy'), YEAR(BillMonth), MONTH(BillMonth)
      ORDER BY YEAR(BillMonth), MONTH(BillMonth)
    `);

    res.json({
      success: true,
      data: {
        buildings:   buildings.recordset[0],
        users:       users.recordset[0],
        billing:     billing.recordset[0],
        complaints:  complaints.recordset[0],
        visitors:    visitors.recordset[0],
        revenueTrend: revenueTrend.recordset,
      }
    });
  } catch (err) { next(err); }
};

// GET /api/dashboard/building-admin
exports.getBuildingAdminDashboard = async (req, res, next) => {
  try {
    const bid = req.user.BuildingID;
    const inputs = { bid: { type: sql.UniqueIdentifier, value: bid } };

    const [units, users, billing, complaints, visitors, canteen, parking] = await Promise.all([
      query(`SELECT
               COUNT(*) AS Total,
               SUM(CASE WHEN Status = 'Occupied' THEN 1 ELSE 0 END) AS Occupied,
               SUM(CASE WHEN Status = 'Vacant' THEN 1 ELSE 0 END) AS Vacant
             FROM Units WHERE BuildingID = @bid AND IsActive = 1`, inputs),
      query(`SELECT COUNT(*) AS Total FROM Users WHERE BuildingID = @bid AND IsActive = 1 AND Role IN ('Resident','Tenant')`, inputs),
      query(`SELECT
               SUM(TotalAmount) AS Billed,
               SUM(PaidAmount) AS Collected,
               SUM(CASE WHEN PaymentStatus = 'Overdue' THEN 1 ELSE 0 END) AS OverdueBills,
               SUM(CASE WHEN PaymentStatus = 'Pending' AND DueDate < GETUTCDATE() THEN TotalAmount - PaidAmount ELSE 0 END) AS OverdueAmount
             FROM Bills WHERE BuildingID = @bid`, inputs),
      query(`SELECT
               COUNT(*) AS Total,
               SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) AS Open,
               SUM(CASE WHEN Status = 'InProgress' THEN 1 ELSE 0 END) AS InProgress,
               SUM(CASE WHEN Priority = 'Emergency' AND Status NOT IN ('Resolved','Closed') THEN 1 ELSE 0 END) AS Emergencies
             FROM Complaints WHERE BuildingID = @bid`, inputs),
      query(`SELECT COUNT(*) AS TodayCount, SUM(CASE WHEN Status='CheckedIn' THEN 1 ELSE 0 END) AS CurrentIn
             FROM Visitors WHERE BuildingID = @bid AND CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE)`, inputs),
      query(`SELECT COUNT(*) AS TodayOrders, SUM(TotalAmount) AS TodayRevenue
             FROM CanteenOrders WHERE BuildingID = @bid AND OrderDate = CAST(GETUTCDATE() AS DATE)`, inputs),
      query(`SELECT
               COUNT(*) AS Total,
               SUM(CASE WHEN Status = 'Available' THEN 1 ELSE 0 END) AS Available,
               SUM(CASE WHEN Status = 'Occupied' THEN 1 ELSE 0 END) AS Occupied
             FROM ParkingSlots WHERE BuildingID = @bid AND IsActive = 1`, inputs),
    ]);

    // Recent complaints
    const recentComplaints = await query(
      `SELECT TOP 5 c.ComplaintID, c.Title, c.Category, c.Priority, c.Status, c.CreatedAt, u.FullName AS RaisedBy
       FROM Complaints c JOIN Users u ON c.RaisedBy = u.UserID
       WHERE c.BuildingID = @bid ORDER BY c.CreatedAt DESC`,
      inputs
    );

    // Pending bills
    const pendingBills = await query(
      `SELECT TOP 5 b.BillID, b.BillType, b.TotalAmount, b.DueDate, b.PaymentStatus, u.FullName AS ResidentName
       FROM Bills b JOIN Users u ON b.UserID = u.UserID
       WHERE b.BuildingID = @bid AND b.PaymentStatus IN ('Pending','Overdue')
       ORDER BY b.DueDate ASC`,
      inputs
    );

    res.json({
      success: true,
      data: {
        units:       units.recordset[0],
        users:       users.recordset[0],
        billing:     billing.recordset[0],
        complaints:  complaints.recordset[0],
        visitors:    visitors.recordset[0],
        canteen:     canteen.recordset[0],
        parking:     parking.recordset[0],
        recentComplaints: recentComplaints.recordset,
        pendingBills:     pendingBills.recordset,
      }
    });
  } catch (err) { next(err); }
};

// GET /api/dashboard/resident
exports.getResidentDashboard = async (req, res, next) => {
  try {
    const uid = req.user.UserID;
    const inputs = { uid: { type: sql.UniqueIdentifier, value: uid } };

    const [bills, complaints, visitors, orders] = await Promise.all([
      query(`SELECT
               COUNT(*) AS Total,
               SUM(CASE WHEN PaymentStatus = 'Pending' THEN 1 ELSE 0 END) AS Pending,
               SUM(CASE WHEN PaymentStatus = 'Overdue' THEN 1 ELSE 0 END) AS Overdue,
               SUM(CASE WHEN PaymentStatus = 'Pending' THEN TotalAmount - PaidAmount ELSE 0 END) AS AmountDue
             FROM Bills WHERE UserID = @uid`, inputs),
      query(`SELECT COUNT(*) AS Total, SUM(CASE WHEN Status = 'Open' THEN 1 ELSE 0 END) AS Open
             FROM Complaints WHERE RaisedBy = @uid`, inputs),
      query(`SELECT COUNT(*) AS TodayCount FROM Visitors WHERE ResidentID = @uid AND CAST(CreatedAt AS DATE) = CAST(GETUTCDATE() AS DATE)`, inputs),
      query(`SELECT COUNT(*) AS TodayOrders FROM CanteenOrders WHERE UserID = @uid AND OrderDate = CAST(GETUTCDATE() AS DATE)`, inputs),
    ]);

    const pendingBills = await query(
      `SELECT TOP 3 BillID, BillType, TotalAmount, DueDate, PaymentStatus FROM Bills
       WHERE UserID = @uid AND PaymentStatus IN ('Pending','Overdue') ORDER BY DueDate ASC`,
      inputs
    );
    const recentComplaints = await query(
      `SELECT TOP 3 ComplaintID, Title, Status, Priority, CreatedAt FROM Complaints WHERE RaisedBy = @uid ORDER BY CreatedAt DESC`,
      inputs
    );

    res.json({
      success: true,
      data: {
        bills:       bills.recordset[0],
        complaints:  complaints.recordset[0],
        visitors:    visitors.recordset[0],
        orders:      orders.recordset[0],
        pendingBills:     pendingBills.recordset,
        recentComplaints: recentComplaints.recordset,
      }
    });
  } catch (err) { next(err); }
};
