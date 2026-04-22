const { query, sql } = require('../config/database');

// GET /api/complaints
exports.getComplaints = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, category, priority } = req.query;
    const offset = (page - 1) * limit;
    const inputs = {};
    let where = 'WHERE 1=1';

    if (req.user.Role === 'Resident' || req.user.Role === 'Tenant') {
      where += ' AND c.RaisedBy = @userId';
      inputs.userId = { type: sql.UniqueIdentifier, value: req.user.UserID };
    } else if (['BuildingAdmin', 'MaintenanceStaff', 'SecurityStaff'].includes(req.user.Role)) {
      where += ' AND c.BuildingID = @bid';
      inputs.bid = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    }

    if (status)   { where += ' AND c.Status = @status';       inputs.status   = { type: sql.NVarChar, value: status };   }
    if (category) { where += ' AND c.Category = @category';   inputs.category = { type: sql.NVarChar, value: category };  }
    if (priority) { where += ' AND c.Priority = @priority';   inputs.priority = { type: sql.NVarChar, value: priority };  }

    const countResult = await query(`SELECT COUNT(*) AS Total FROM Complaints c ${where}`, inputs);
    inputs.offset = { type: sql.Int, value: offset };
    inputs.limit  = { type: sql.Int, value: parseInt(limit) };

    const result = await query(
      `SELECT c.*, 
              rb.FullName AS RaisedByName, rb.Email AS RaisedByEmail,
              at_.FullName AS AssignedToName,
              u.UnitNumber
       FROM Complaints c
       JOIN Users rb          ON c.RaisedBy = rb.UserID
       LEFT JOIN Users at_    ON c.AssignedTo = at_.UserID
       LEFT JOIN Units u      ON c.UnitID = u.UnitID
       ${where}
       ORDER BY 
         CASE c.Priority WHEN 'Emergency' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END,
         c.CreatedAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      inputs
    );

    res.json({ success: true, data: result.recordset, pagination: { total: countResult.recordset[0].Total, page: parseInt(page) } });
  } catch (err) { next(err); }
};

// POST /api/complaints
exports.createComplaint = async (req, res, next) => {
  try {
    const { category, title, description, priority = 'Medium' } = req.body;
    const photoURL = req.file ? `/uploads/documents/${req.file.filename}` : null;

    // Set SLA based on priority
    const slaHours = { Emergency: 2, High: 8, Medium: 24, Low: 72 };
    const slaDeadline = new Date(Date.now() + (slaHours[priority] || 24) * 3600000);

    const result = await query(
      `INSERT INTO Complaints (BuildingID, UnitID, RaisedBy, Category, Title, Description, Priority, PhotoURL, SLADeadline)
       OUTPUT INSERTED.*
       VALUES (@bid, @unitId, @userId, @cat, @title, @desc, @priority, @photo, @sla)`,
      {
        bid:      { type: sql.UniqueIdentifier, value: req.user.BuildingID },
        unitId:   { type: sql.UniqueIdentifier, value: req.user.UnitID || null },
        userId:   { type: sql.UniqueIdentifier, value: req.user.UserID },
        cat:      { type: sql.NVarChar, value: category },
        title:    { type: sql.NVarChar, value: title },
        desc:     { type: sql.NVarChar, value: description },
        priority: { type: sql.NVarChar, value: priority },
        photo:    { type: sql.NVarChar, value: photoURL },
        sla:      { type: sql.DateTime2, value: slaDeadline },
      }
    );
    res.status(201).json({ success: true, message: 'Complaint submitted', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// PUT /api/complaints/:id/assign
exports.assignComplaint = async (req, res, next) => {
  try {
    const { assignedTo } = req.body;
    const result = await query(
      `UPDATE Complaints SET AssignedTo = @assignedTo, Status = 'Assigned', UpdatedAt = GETUTCDATE()
       OUTPUT INSERTED.* WHERE ComplaintID = @id`,
      {
        assignedTo: { type: sql.UniqueIdentifier, value: assignedTo },
        id:         { type: sql.UniqueIdentifier, value: req.params.id },
      }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Complaint not found' });
    res.json({ success: true, message: 'Complaint assigned', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// PUT /api/complaints/:id/status
exports.updateStatus = async (req, res, next) => {
  try {
    const { status, comment, resolutionNotes } = req.body;
    const resolvedAt = status === 'Resolved' ? new Date() : null;

    await query(
      `UPDATE Complaints SET Status = @status, ResolutionNotes = ISNULL(@notes, ResolutionNotes),
       ResolvedAt = ISNULL(@resolvedAt, ResolvedAt), UpdatedAt = GETUTCDATE()
       WHERE ComplaintID = @id`,
      {
        status:     { type: sql.NVarChar, value: status },
        notes:      { type: sql.NVarChar, value: resolutionNotes || null },
        resolvedAt: { type: sql.DateTime2, value: resolvedAt },
        id:         { type: sql.UniqueIdentifier, value: req.params.id },
      }
    );

    // Add update log
    await query(
      `INSERT INTO ComplaintUpdates (ComplaintID, UpdatedBy, StatusChange, Comment) VALUES (@cid, @uid, @status, @comment)`,
      {
        cid:     { type: sql.UniqueIdentifier, value: req.params.id },
        uid:     { type: sql.UniqueIdentifier, value: req.user.UserID },
        status:  { type: sql.NVarChar, value: status },
        comment: { type: sql.NVarChar, value: comment || `Status changed to ${status}` },
      }
    );

    res.json({ success: true, message: 'Status updated' });
  } catch (err) { next(err); }
};

// POST /api/complaints/:id/feedback
exports.submitFeedback = async (req, res, next) => {
  try {
    const { rating, comment } = req.body;
    await query(
      `UPDATE Complaints SET RatingByResident = @rating, FeedbackComment = @comment, Status = 'Closed', UpdatedAt = GETUTCDATE()
       WHERE ComplaintID = @id AND RaisedBy = @userId`,
      {
        rating:  { type: sql.Int, value: rating },
        comment: { type: sql.NVarChar, value: comment || null },
        id:      { type: sql.UniqueIdentifier, value: req.params.id },
        userId:  { type: sql.UniqueIdentifier, value: req.user.UserID },
      }
    );
    res.json({ success: true, message: 'Feedback submitted' });
  } catch (err) { next(err); }
};
