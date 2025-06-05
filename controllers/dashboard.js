const db = require('../config/db');

const getDashboardData = async (req, res) => {
  const { startDate, endDate } = req.query;

  const startDateTime = `${startDate} 00:00:00`;
  const endDateTime = `${endDate} 23:59:59`;

  // console.log("Start:", startDate, "End:", endDate);


  try {
    const [tickets] = await db.query(`
      SELECT COUNT(*) AS totalTickets FROM ost_ticket
      WHERE created BETWEEN ? AND ?`, [startDateTime, endDateTime]);

    const [resolved] = await db.query(`
      SELECT COUNT(*) AS totalResolved FROM ost_ticket
      WHERE closed IS NOT NULL AND created BETWEEN ? AND ?`, [startDateTime, endDateTime]);

    const [avgResolution] = await db.query(`
      SELECT AVG(TIMESTAMPDIFF(SECOND, created, closed) / 3600) AS avgResolutionTime
      FROM ost_ticket
      WHERE closed IS NOT NULL AND created BETWEEN ? AND ?`, [startDateTime, endDateTime]);

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
    `, [startDateTime, endDateTime]);

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

// module.exports = {getDashboardData};



const getChartData = async (req, res) => {
  const { startDate, endDate, groupBy } = req.query;

  let groupFormat;
  if (groupBy === 'daily') groupFormat = '%Y-%m-%d';
  else if (groupBy === 'weekly') groupFormat = '%Y-%u';
  else if (groupBy === 'monthly') groupFormat = '%Y-%m';
  else return res.status(400).json({ error: 'Invalid groupBy. Use daily, weekly, or monthly.' });

  const startDateTime = `${startDate} 00:00:00`;
  const endDateTime = `${endDate} 23:59:59`;

  const formatNumber = (num) => (num !== null && num !== undefined) ? Number(num).toFixed(2) : '0';

  try {
    let ticketResultsRaw = await db.query(`
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

    let ticketResults;
    if (Array.isArray(ticketResultsRaw)) {
      ticketResults = Array.isArray(ticketResultsRaw[0]) ? ticketResultsRaw[0] : ticketResultsRaw;
    } else if (typeof ticketResultsRaw === 'object') {
      ticketResults = [ticketResultsRaw];
    } else {
      ticketResults = [];
    }
    // console.log('Normalized ticketResults:', ticketResults);

    let responseResults = [];
    try {
      const [result] = await db.query(`
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

      responseResults = result || [];
      // console.log('responseResults:', responseResults);
    } catch (err) {
      console.error('DB error (responseResults):', err);
      responseResults = [];
    }

    const responseMap = {};
    responseResults.forEach(r => {
      if (r && r.period !== undefined && r.period !== null) {
        responseMap[r.period] = formatNumber(r.avgFirstResponseTime);
      }
    });

    const finalData = ticketResults.map(row => ({
      period: row.period,
      totalTickets: Number(row.totalTickets),
      resolvedTickets: Number(row.resolvedTickets),
      avgResolutionTime: formatNumber(row.avgResolutionTime),
      avgFirstResponseTime: responseMap[row.period] || '0'
    }));

    // console.log('finalData:', finalData);

    res.json(finalData);
  } catch (err) {
    console.error('DB error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getChartData, getDashboardData };



// ****************************************   dashboard   Chart data **********************



// function bigintToNumber(obj) {
//   return JSON.parse(JSON.stringify(obj, (_, value) =>
//     typeof value === 'bigint' ? value.toString() : value
//   ));
// }

// exports.dashboardChartData = async (req, res) => {
//   const { startDate, endDate, period } = req.query;

//   try {
//     let groupByQuery = '';
//     if (period === 'daily') {
//       groupByQuery = "DATE(created)";
//     } else if (period === 'weekly') {
//       groupByQuery = "YEARWEEK(created, 1)";
//     } else if (period === 'monthly') {
//       groupByQuery = "DATE_FORMAT(created, '%Y-%m')";
//     } else {
//       groupByQuery = "DATE(created)";
//     }

//     const [data] = await db.query(`
//       SELECT
//         ${groupByQuery} AS period,
//         COUNT(*) AS tickets,
//         SUM(CASE WHEN closed IS NOT NULL THEN 1 ELSE 0 END) AS resolved,
//         AVG(TIMESTAMPDIFF(SECOND, created, closed)/3600) AS avgResolutionTime,
//         AVG(
//           (SELECT MIN(TIMESTAMPDIFF(SECOND, t.created, e.created)/3600)
//            FROM ost_thread_entry e
//            JOIN ost_thread th ON e.thread_id = th.id
//            WHERE e.type = 'R' AND th.object_id = t.ticket_id AND th.object_type = 'T'
//           )
//         ) AS avgFirstResponseTime
//       FROM ost_ticket t
//       WHERE created BETWEEN ? AND ?
//       GROUP BY period
//       ORDER BY period ASC
//     `, [startDate, endDate]);

//     const safeData = bigintToNumber(data);
//     res.json(safeData);

//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: 'Failed to fetch time series data' });
//   }
// };



// exports.getChartData = async (req, res) => {
//   const { startDate, endDate, groupBy } = req.query;

//   let groupFormat;
//   if (groupBy === 'daily') groupFormat = '%Y-%m-%d';
//   else if (groupBy === 'weekly') groupFormat = '%Y-%u';
//   else if (groupBy === 'monthly') groupFormat = '%Y-%m';
//   else return res.status(400).json({ error: 'Invalid groupBy. Use daily, weekly, or monthly.' });

//   const startDateTime = `${startDate} 00:00:00`;
//   const endDateTime = `${endDate} 23:59:59`;

//   const formatNumber = (num) => (num !== null && num !== undefined) ? Number(num).toFixed(2) : '0';

//   try {
//     // 🔍 Log input dates and format
//     console.log('🕓 startDateTime:', startDateTime);
//     console.log('🕓 endDateTime:', endDateTime);
//     console.log('📅 groupFormat:', groupFormat);

//     // 🧪 Raw query for manual testing
//     const rawSQL = `
//       SELECT
//         DATE_FORMAT(created, '${groupFormat}') AS period,
//         COUNT(*) AS totalTickets,
//         SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) AS resolvedTickets,
//         IFNULL(AVG(TIMESTAMPDIFF(SECOND, created, closed)) / 3600, 0) AS avgResolutionTime
//       FROM ost_ticket
//       WHERE created BETWEEN '${startDateTime}' AND '${endDateTime}'
//       GROUP BY period
//       ORDER BY period ASC;
//     `;
//     console.log('🧾 Raw SQL (for manual check):', rawSQL);

//     // 🔄 Run actual query
//     const [ticketResults] = await db.query(`
//       SELECT
//         DATE_FORMAT(created, ?) AS period,
//         COUNT(*) AS totalTickets,
//         SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) AS resolvedTickets,
//         IFNULL(AVG(TIMESTAMPDIFF(SECOND, created, closed)) / 3600, 0) AS avgResolutionTime
//       FROM ost_ticket
//       WHERE created BETWEEN ? AND ?
//       GROUP BY period
//       ORDER BY period ASC
//     `, [groupFormat, startDateTime, endDateTime]);

//     console.log('📊 ticketResults:', ticketResults);

//     let responseResults = [];
//     try {
//       [responseResults] = await db.query(`
//         SELECT
//           period,
//           IFNULL(AVG(first_response_seconds) / 3600, 0) AS avgFirstResponseTime
//         FROM (
//           SELECT
//             DATE_FORMAT(t.created, ?) AS period,
//             t.ticket_id,
//             TIMESTAMPDIFF(SECOND, t.created, MIN(te.created)) AS first_response_seconds
//           FROM ost_ticket t
//           JOIN ost_thread th ON th.object_id = t.ticket_id AND th.object_type = 'T'
//           JOIN ost_thread_entry te ON te.thread_id = th.id
//           WHERE te.user_id IS NULL
//             AND t.created BETWEEN ? AND ?
//           GROUP BY t.ticket_id, t.created
//         ) AS sub
//         GROUP BY period
//       `, [groupFormat, startDateTime, endDateTime]);

//       console.log('📬 responseResults:', responseResults);
//     } catch (err) {
//       console.error('❌ DB error (responseResults):', err);
//     }

//     const responseMap = {};
//     responseResults.forEach(r => {
//       responseMap[r.period] = formatNumber(r.avgFirstResponseTime);
//     });

//     const finalData = Array.isArray(ticketResults) ? ticketResults.map(row => ({
//       period: row.period,
//       totalTickets: row.totalTickets,
//       resolvedTickets: row.resolvedTickets,
//       avgResolutionTime: formatNumber(row.avgResolutionTime),
//       avgFirstResponseTime: responseMap[row.period] || '0'
//     })) : [];

//     console.log('✅ finalData:', finalData);
//     res.json(finalData);
//   } catch (err) {
//     console.error('❌ DB error:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };






// exports.getChartData = async (req, res) => {
//   const { startDate, endDate, groupBy } = req.query;
//   let groupFormat;
//   if (groupBy === 'daily') groupFormat = '%Y-%m-%d';
//   else if (groupBy === 'weekly') groupFormat = '%Y-%u';
//   else if (groupBy === 'monthly') groupFormat = '%Y-%m';
//   else return res.status(400).json({ error: 'Invalid groupBy. Use daily, weekly, or monthly.' });

//   const startDateTime = `${startDate} 00:00:00`;
//   const endDateTime = `${endDate} 23:59:59`;

//   const formatNumber = (num) => (num !== null && num !== undefined) ? Number(num).toFixed(2) : '0';

//   try {
//     console.log('🕓 startDateTime:', startDateTime);
//     console.log('🕓 endDateTime:', endDateTime);
//     console.log('📅 groupFormat:', groupFormat);

//     // Pehla query — tickets ke data ke liye
//     const [ticketResults] = await db.query(`
//       SELECT
//         DATE_FORMAT(created, ?) AS period,
//         COUNT(*) AS totalTickets,
//         SUM(CASE WHEN status_id = 3 THEN 1 ELSE 0 END) AS resolvedTickets,
//         IFNULL(AVG(TIMESTAMPDIFF(SECOND, created, closed)) / 3600, 0) AS avgResolutionTime
//       FROM ost_ticket
//       WHERE created BETWEEN ? AND ?
//       GROUP BY period
//       ORDER BY period ASC
//     `, [groupFormat, startDateTime, endDateTime]);

//     console.log('📊 ticketResults:', ticketResults);

//     // Dusra query — average first response time ke liye (jo pehle error kar raha tha)
//     let responseResults = [];
//     try {
//       const [result] = await db.query(`
//         SELECT
//           period,
//           IFNULL(AVG(first_response_seconds) / 3600, 0) AS avgFirstResponseTime
//         FROM (
//           SELECT
//             DATE_FORMAT(t.created, ?) AS period,
//             t.ticket_id,
//             TIMESTAMPDIFF(SECOND, t.created, MIN(te.created)) AS first_response_seconds
//           FROM ost_ticket t
//           JOIN ost_thread th ON th.object_id = t.ticket_id AND th.object_type = 'T'
//           JOIN ost_thread_entry te ON te.thread_id = th.id
//           WHERE te.user_id IS NULL
//             AND t.created BETWEEN ? AND ?
//           GROUP BY t.ticket_id, t.created
//         ) AS sub
//         GROUP BY period
//       `, [groupFormat, startDateTime, endDateTime]);

//       responseResults = result || [];
//       console.log('📬 responseResults:', responseResults);
//     } catch (err) {
//       console.error('❌ DB error (responseResults):', err);
//       responseResults = [];
//     }

//     // responseResults ko map karenge period ke hisaab se
//     const responseMap = {};
//     responseResults.forEach(r => {
//       responseMap[r.period] = formatNumber(r.avgFirstResponseTime);
//     });

//     // final data banayenge jo frontend ko bhejna hai
//     const finalData = Array.isArray(ticketResults) ? ticketResults.map(row => ({
//       period: row.period,
//       totalTickets: Number(row.totalTickets),        // agar bigint hai to Number me convert karna safe hai
//       resolvedTickets: Number(row.resolvedTickets),
//       avgResolutionTime: formatNumber(row.avgResolutionTime),
//       avgFirstResponseTime: responseMap[row.period] || '0'
//     })) : [];

//     console.log('finalData:', finalData);

//     res.json(finalData);

//   } catch (err) {
//     console.error('❌ DB error:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

