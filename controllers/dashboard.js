const db = require('../config/db');

exports.getDashboardData = async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    const [tickets] = await db.query(`
      SELECT COUNT(*) AS totalTickets FROM ost_ticket
      WHERE created BETWEEN ? AND ?`, [startDate, endDate]);

    const [resolved] = await db.query(`
      SELECT COUNT(*) AS totalResolved FROM ost_ticket
      WHERE closed IS NOT NULL AND created BETWEEN ? AND ?`, [startDate, endDate]);

    const [avgResolution] = await db.query(`
      SELECT AVG(TIMESTAMPDIFF(SECOND, created, closed) / 3600) AS avgResolutionTime
      FROM ost_ticket
      WHERE closed IS NOT NULL AND created BETWEEN ? AND ?`, [startDate, endDate]);

    const [firstResponse] = await db.query(`
      SELECT AVG(TIMESTAMPDIFF(SECOND, t.created, te.first_response_time) / 3600) AS avgFirstResponseTime
      FROM (
        SELECT 
          ticket.ticket_id,
          ticket.created,
          MIN(entry.created) AS first_response_time
        FROM ost_ticket AS ticket
        JOIN ost_thread AS thread ON thread.object_id = ticket.ticket_id AND thread.object_type = 'T'
        JOIN ost_thread_entry AS entry ON entry.thread_id = thread.id
        WHERE entry.type = 'R'
          AND ticket.created BETWEEN ? AND ?
        GROUP BY ticket.ticket_id
      ) AS te
      JOIN ost_ticket t ON te.ticket_id = t.ticket_id;
    `, [startDate, endDate]);

    res.json({
      totalTickets: tickets.totalTickets ? Number(tickets.totalTickets) : 0,
      totalResolved: resolved.totalResolved ? Number(resolved.totalResolved) : 0,
      avgResolutionTime: avgResolution.avgResolutionTime !== null ? Number(avgResolution.avgResolutionTime).toFixed(2) : '0',
      avgFirstResponseTime: firstResponse.avgFirstResponseTime !== null ? Number(firstResponse.avgFirstResponseTime).toFixed(2) : '0'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
};



// ****************************************   dashboard   Chart data **********************



function bigintToNumber(obj) {
  return JSON.parse(JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

exports.dashboardChartData = async (req, res) => {
  const { startDate, endDate, period } = req.query;

  try {
    let groupByQuery = '';
    if (period === 'daily') {
      groupByQuery = "DATE(created)";
    } else if (period === 'weekly') {
      groupByQuery = "YEARWEEK(created, 1)";
    } else if (period === 'monthly') {
      groupByQuery = "DATE_FORMAT(created, '%Y-%m')";
    } else {
      groupByQuery = "DATE(created)";
    }

    const [data] = await db.query(`
      SELECT 
        ${groupByQuery} AS period,
        COUNT(*) AS tickets,
        SUM(CASE WHEN closed IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
        AVG(TIMESTAMPDIFF(SECOND, created, closed)/3600) AS avgResolutionTime,
        AVG(
          (SELECT MIN(TIMESTAMPDIFF(SECOND, t.created, e.created)/3600)
           FROM ost_thread_entry e
           JOIN ost_thread th ON e.thread_id = th.id
           WHERE e.type = 'R' AND th.object_id = t.ticket_id AND th.object_type = 'T'
          )
        ) AS avgFirstResponseTime
      FROM ost_ticket t
      WHERE created BETWEEN ? AND ?
      GROUP BY period
      ORDER BY period ASC
    `, [startDate, endDate]);

    const safeData = bigintToNumber(data);
    res.json(safeData);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch time series data' });
  }
};



exports.getChartData = async (req, res) => {
  const { startDate, endDate, groupBy } = req.query;
  let groupFormat;
  if (groupBy === 'daily') groupFormat = '%Y-%m-%d';
  else if (groupBy === 'weekly') groupFormat = '%Y-%u'; // changed here
  else if (groupBy === 'monthly') groupFormat = '%Y-%m';
  else return res.status(400).json({ error: 'Invalid groupBy. Use daily, weekly, or monthly.' });

  const startDateTime = `${startDate} 00:00:00`;
  const endDateTime = `${endDate} 23:59:59`;

  const formatNumber = (num) => (num !== null && num !== undefined) ? Number(num).toFixed(2) : '0';

  try {
    const [ticketResults] = await db.query(`
            SELECT
                DATE_FORMAT(created, ?) AS period,
                COUNT(*) AS totalTickets,
                SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) AS resolvedTickets,
                IFNULL(AVG(TIMESTAMPDIFF(SECOND, created, closed)) / 3600, 0) AS avgResolutionTime
            FROM ost_ticket
            WHERE created BETWEEN ? AND ?
            GROUP BY period
            ORDER BY period ASC
        `, [groupFormat, startDateTime, endDateTime]);

    let responseResults = [];
    try {
      [responseResults] = await db.query(`
                SELECT
                    period,
                    IFNULL(AVG(first_response_seconds) / 3600, 0) AS avgFirstResponseTime
                FROM (
                    SELECT
                        DATE_FORMAT(t.created, ?) AS period,
                        t.ticket_id,
                        TIMESTAMPDIFF(SECOND, t.created, MIN(te.created)) AS first_response_seconds
                    FROM ost_ticket t
                    JOIN ost_thread th ON th.object_id = t.ticket_id AND th.object_type = 'T'
                    JOIN ost_thread_entry te ON te.thread_id = th.id
                    WHERE te.user_id IS NULL
                      AND t.created BETWEEN ? AND ?
                    GROUP BY t.ticket_id, t.created
                ) AS sub
                GROUP BY period
            `, [groupFormat, startDateTime, endDateTime]);
      if (!Array.isArray(responseResults)) responseResults = [];
    } catch (err) {
      console.error('❌ DB error (responseResults):', err);
      responseResults = [];
    }

    const responseMap = {};
    responseResults.forEach(r => {
      responseMap[r.period] = formatNumber(r.avgFirstResponseTime);
    });

    const finalData = Array.isArray(ticketResults) ? ticketResults.map(row => ({
      period: row.period,
      totalTickets: row.totalTickets,
      resolvedTickets: row.resolvedTickets,
      avgResolutionTime: formatNumber(row.avgResolutionTime),
      avgFirstResponseTime: responseMap[row.period] || '0'
    })) : [];

    console.log('finalData:', finalData);

    res.json(finalData);
  } catch (err) {
    console.error('❌ DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};






// ****************************   Second Time

// GET /api/tickets/summary
// exports.getTicketSummary = async (req, res) => {
//   const { from, to } = req.query;

//   try {
//     // 1. Total Tickets
//     const [totalRows] = await db.query(
//       `SELECT COUNT(*) AS total FROM ost_ticket WHERE created BETWEEN ? AND ?`,
//       [from, to]
//     );
//     const total = totalRows[0]?.total || 0;

//     // 2. Resolved Tickets
//     const [resolvedRows] = await db.query(
//       `SELECT COUNT(*) AS resolved
//        FROM ost_ticket
//        WHERE status_id IN (SELECT id FROM ost_ticket_status WHERE state = 'closed')
//        AND created BETWEEN ? AND ?`,
//       [from, to]
//     );
//     const resolved = resolvedRows[0]?.resolved || 0;

//     // 3. Average Resolution Time (in hours)
//     const [avgResolutionRows] = await db.query(
//       `SELECT AVG(TIMESTAMPDIFF(SECOND, created, closed)/3600) AS avg_resolution
//        FROM ost_ticket
//        WHERE closed IS NOT NULL AND created BETWEEN ? AND ?`,
//       [from, to]
//     );
//     const avgResolution = avgResolutionRows[0]?.avg_resolution || 0;

//     // 4. Average First Response Time (in hours)
//     const [avgResponseRows] = await db.query(
//       `SELECT AVG(TIMESTAMPDIFF(SECOND, T.created, E.created)/3600) AS avg_first_response
//        FROM ost_ticket T
//        JOIN ost_thread TH ON TH.object_id = T.ticket_id
//        JOIN (
//            SELECT thread_id, MIN(created) AS created
//            FROM ost_thread_entry
//            WHERE poster != 'SYSTEM'
//            GROUP BY thread_id
//        ) E ON E.thread_id = TH.id
//        WHERE T.created BETWEEN ? AND ?`,
//       [from, to]
//     );
//     const avgResponse = avgResponseRows[0]?.avg_first_response || 0;

//     // 5. Resolution Rate
//     const resolutionRate = total > 0 ? (resolved / total) * 100 : 0;

//     // Response
//     res.json({
//       total,
//       resolved,
//       resolution_rate: resolutionRate.toFixed(1),
//       avg_resolution_time: avgResolution.toFixed(2),
//       avg_first_response_time: avgResponse.toFixed(2),
//     });

//   } catch (err) {
//     console.error("Error in getTicketSummary:", err);
//     res.status(500).json({ message: 'Error fetching summary', error: err });
//   }
// };






// GET /api/tickets/volume?from=...&to=...&group=weekly
// exports.getTicketVolume = async (req, res) => {
//   const { from, to, group } = req.query;

//   let groupBy = '';
//   if (group === 'daily') groupBy = 'DATE(created)';
//   else if (group === 'weekly') groupBy = 'YEARWEEK(created, 1)';
//   else if (group === 'monthly') groupBy = 'DATE_FORMAT(created, "%Y-%m")';
//   else {
//     return res.status(400).json({ message: 'Invalid group parameter. Use daily, weekly, or monthly.' });
//   }

//   if (!from || !to) {
//     return res.status(400).json({ message: 'Missing from/to date range.' });
//   }

//   try {
//     const [result] = await db.query(
//       `SELECT ${groupBy} AS period, COUNT(*) AS count
//        FROM ost_ticket
//        WHERE created BETWEEN ? AND ?
//        GROUP BY period
//        ORDER BY period`,
//       [from, to]
//     );
//     res.json(result);
//   } catch (err) {
//     console.error("Error in getTicketVolume:", err);
//     res.status(500).json({ message: 'Error fetching volume data', error: err.message });
//   }
// };

