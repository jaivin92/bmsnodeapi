const { query, sql } = require('../config/database');

// GET /api/notices
exports.getNotices = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type, priority } = req.query;
    const offset = (page - 1) * limit;
    const inputs = {};
    let where = 'WHERE n.IsActive = 1 AND n.PublishAt <= GETUTCDATE()';

    // Residents see their building notices
    if (req.user.BuildingID) {
      where += ' AND (n.BuildingID = @bid OR n.BuildingID IS NULL)';
      inputs.bid = { type: sql.UniqueIdentifier, value: req.user.BuildingID };
    }
    if (type)     { where += ' AND n.NoticeType = @type';     inputs.type     = { type: sql.NVarChar, value: type };     }
    if (priority) { where += ' AND n.Priority = @priority';   inputs.priority = { type: sql.NVarChar, value: priority };  }

    const countResult = await query(`SELECT COUNT(*) AS Total FROM Notices n ${where}`, inputs);
    inputs.offset = { type: sql.Int, value: offset };
    inputs.limit  = { type: sql.Int, value: parseInt(limit) };

    const result = await query(
      `SELECT n.*, u.FullName AS PublishedByName, b.BuildingName
       FROM Notices n
       JOIN Users u          ON n.PublishedBy = u.UserID
       LEFT JOIN Buildings b ON n.BuildingID = b.BuildingID
       ${where}
       ORDER BY n.Priority DESC, n.PublishAt DESC
       OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
      inputs
    );

    res.json({ success: true, data: result.recordset, pagination: { total: countResult.recordset[0].Total, page: parseInt(page) } });
  } catch (err) { next(err); }
};

// POST /api/notices
exports.createNotice = async (req, res, next) => {
  try {
    const { title, content, noticeType = 'General', priority = 'Normal', targetRole = 'All', publishAt, expiresAt } = req.body;
    const attachmentURL = req.file ? `/uploads/documents/${req.file.filename}` : null;

    const result = await query(
      `INSERT INTO Notices (BuildingID, Title, Content, NoticeType, Priority, TargetRole, PublishedBy, PublishAt, ExpiresAt, AttachmentURL)
       OUTPUT INSERTED.*
       VALUES (@bid, @title, @content, @type, @priority, @role, @publishedBy, @publishAt, @expiresAt, @attachment)`,
      {
        bid:        { type: sql.UniqueIdentifier, value: req.user.BuildingID || null },
        title:      { type: sql.NVarChar, value: title },
        content:    { type: sql.NVarChar, value: content },
        type:       { type: sql.NVarChar, value: noticeType },
        priority:   { type: sql.NVarChar, value: priority },
        role:       { type: sql.NVarChar, value: targetRole },
        publishedBy:{ type: sql.UniqueIdentifier, value: req.user.UserID },
        publishAt:  { type: sql.DateTime2, value: publishAt ? new Date(publishAt) : new Date() },
        expiresAt:  { type: sql.DateTime2, value: expiresAt ? new Date(expiresAt) : null },
        attachment: { type: sql.NVarChar, value: attachmentURL },
      }
    );
    res.status(201).json({ success: true, message: 'Notice published', data: result.recordset[0] });
  } catch (err) { next(err); }
};

// PUT /api/notices/:id
exports.updateNotice = async (req, res, next) => {
  try {
    const { title, content, isActive, expiresAt } = req.body;
    const result = await query(
      `UPDATE Notices SET Title=@title, Content=@content, IsActive=@active, ExpiresAt=@exp
       OUTPUT INSERTED.* WHERE NoticeID = @id AND PublishedBy = @uid`,
      {
        title:  { type: sql.NVarChar, value: title },
        content:{ type: sql.NVarChar, value: content },
        active: { type: sql.Bit, value: isActive !== false ? 1 : 0 },
        exp:    { type: sql.DateTime2, value: expiresAt ? new Date(expiresAt) : null },
        id:     { type: sql.UniqueIdentifier, value: req.params.id },
        uid:    { type: sql.UniqueIdentifier, value: req.user.UserID },
      }
    );
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Notice not found or unauthorized' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (err) { next(err); }
};

// DELETE /api/notices/:id
exports.deleteNotice = async (req, res, next) => {
  try {
    await query(
      'UPDATE Notices SET IsActive = 0 WHERE NoticeID = @id',
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    res.json({ success: true, message: 'Notice removed' });
  } catch (err) { next(err); }
};
