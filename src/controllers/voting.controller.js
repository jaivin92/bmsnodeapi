const { query, sql } = require('../config/database');

// GET /api/voting
exports.getPolls = async (req, res, next) => {
  try {
    const { status } = req.query;
    const bid = req.user.BuildingID;
    const inputs = { bid: { type: sql.UniqueIdentifier, value: bid } };
    let where = 'WHERE p.BuildingID = @bid';
    if (status) { where += ' AND p.Status = @status'; inputs.status = { type: sql.NVarChar, value: status }; }

    const result = await query(
      `SELECT p.*, u.FullName AS CreatedByName,
              (SELECT COUNT(*) FROM PollVotes pv WHERE pv.PollID = p.PollID) AS TotalVotes,
              (SELECT COUNT(*) FROM PollOptions po WHERE po.PollID = p.PollID) AS OptionCount
       FROM Polls p
       JOIN Users u ON p.CreatedBy = u.UserID
       ${where}
       ORDER BY p.CreatedAt DESC`,
      inputs
    );
    res.json({ success: true, data: result.recordset });
  } catch (err) { next(err); }
};

// GET /api/voting/:id
exports.getPollById = async (req, res, next) => {
  try {
    const pollResult = await query(
      `SELECT p.*, u.FullName AS CreatedByName FROM Polls p JOIN Users u ON p.CreatedBy = u.UserID WHERE p.PollID = @id`,
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    if (!pollResult.recordset.length) return res.status(404).json({ success: false, message: 'Poll not found' });

    const optionsResult = await query(
      `SELECT po.*, COUNT(pv.VoteID) AS VoteCount
       FROM PollOptions po
       LEFT JOIN PollVotes pv ON po.OptionID = pv.OptionID
       WHERE po.PollID = @id
       GROUP BY po.OptionID, po.PollID, po.OptionText, po.DisplayOrder
       ORDER BY po.DisplayOrder`,
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );

    // Check if current user voted
    const myVote = await query(
      'SELECT OptionID FROM PollVotes WHERE PollID = @pid AND VotedBy = @uid',
      {
        pid: { type: sql.UniqueIdentifier, value: req.params.id },
        uid: { type: sql.UniqueIdentifier, value: req.user.UserID },
      }
    );

    res.json({
      success: true,
      data: {
        ...pollResult.recordset[0],
        options: optionsResult.recordset,
        myVote: myVote.recordset[0]?.OptionID || null,
        hasVoted: myVote.recordset.length > 0,
      }
    });
  } catch (err) { next(err); }
};

// POST /api/voting
exports.createPoll = async (req, res, next) => {
  try {
    const { title, description, options, startDate, endDate, isAnonymous = false, isMultiChoice = false } = req.body;

    const pollResult = await query(
      `INSERT INTO Polls (BuildingID, Title, Description, CreatedBy, StartDate, EndDate, IsAnonymous, IsMultiChoice)
       OUTPUT INSERTED.PollID
       VALUES (@bid, @title, @desc, @userId, @start, @end, @anon, @multi)`,
      {
        bid:    { type: sql.UniqueIdentifier, value: req.user.BuildingID },
        title:  { type: sql.NVarChar, value: title },
        desc:   { type: sql.NVarChar, value: description || null },
        userId: { type: sql.UniqueIdentifier, value: req.user.UserID },
        start:  { type: sql.DateTime2, value: startDate },
        end:    { type: sql.DateTime2, value: endDate },
        anon:   { type: sql.Bit, value: isAnonymous ? 1 : 0 },
        multi:  { type: sql.Bit, value: isMultiChoice ? 1 : 0 },
      }
    );

    const pollId = pollResult.recordset[0].PollID;
    for (let i = 0; i < options.length; i++) {
      await query(
        'INSERT INTO PollOptions (PollID, OptionText, DisplayOrder) VALUES (@pid, @text, @order)',
        {
          pid:   { type: sql.UniqueIdentifier, value: pollId },
          text:  { type: sql.NVarChar, value: options[i] },
          order: { type: sql.Int, value: i },
        }
      );
    }

    res.status(201).json({ success: true, message: 'Poll created', data: { pollId } });
  } catch (err) { next(err); }
};

// POST /api/voting/:id/vote
exports.castVote = async (req, res, next) => {
  try {
    const { optionId } = req.body;

    // Check poll is active
    const pollResult = await query(
      `SELECT * FROM Polls WHERE PollID = @id AND Status = 'Active' AND StartDate <= GETUTCDATE() AND EndDate >= GETUTCDATE()`,
      { id: { type: sql.UniqueIdentifier, value: req.params.id } }
    );
    if (!pollResult.recordset.length) {
      return res.status(400).json({ success: false, message: 'Poll is not active or has ended' });
    }

    // Check if already voted
    const existing = await query(
      'SELECT VoteID FROM PollVotes WHERE PollID = @pid AND VotedBy = @uid',
      {
        pid: { type: sql.UniqueIdentifier, value: req.params.id },
        uid: { type: sql.UniqueIdentifier, value: req.user.UserID },
      }
    );
    if (existing.recordset.length && !pollResult.recordset[0].IsMultiChoice) {
      return res.status(409).json({ success: false, message: 'You have already voted' });
    }

    await query(
      'INSERT INTO PollVotes (PollID, OptionID, VotedBy) VALUES (@pid, @oid, @uid)',
      {
        pid: { type: sql.UniqueIdentifier, value: req.params.id },
        oid: { type: sql.UniqueIdentifier, value: optionId },
        uid: { type: sql.UniqueIdentifier, value: req.user.UserID },
      }
    );

    res.json({ success: true, message: 'Vote cast successfully' });
  } catch (err) { next(err); }
};

// PUT /api/voting/:id/close
exports.closePoll = async (req, res, next) => {
  try {
    await query(
      `UPDATE Polls SET Status = 'Closed', UpdatedAt = GETUTCDATE() WHERE PollID = @id AND BuildingID = @bid`,
      {
        id:  { type: sql.UniqueIdentifier, value: req.params.id },
        bid: { type: sql.UniqueIdentifier, value: req.user.BuildingID },
      }
    );
    res.json({ success: true, message: 'Poll closed' });
  } catch (err) { next(err); }
};
