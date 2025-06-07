// const db = require("../config/db");
// exports.agentPerformance = async (req, res) => {
//   try {
//     const result = await db.query(`
//       SELECT
//         s.staff_id,
//         CONCAT(s.firstname, ' ', s.lastname) AS name,
//         COUNT(t.ticket_id) AS assigned,
//         SUM(t.status_id = 3) AS closed,
//         CONCAT(ROUND(SUM(t.status_id = 3) / COUNT(t.ticket_id) * 100), '%') AS closerrate,
//         SEC_TO_TIME(AVG(CASE WHEN t.status_id = 3 THEN UNIX_TIMESTAMP(t.closed) - UNIX_TIMESTAMP(t.created) END)) AS avg_resolution_time,
//         SEC_TO_TIME(AVG(CASE WHEN t.status_id = 3 THEN UNIX_TIMESTAMP(th.created) - UNIX_TIMESTAMP(t.created) END)) AS avg_response
//       FROM ost_ticket t
//       JOIN ost_staff s ON t.staff_id = s.staff_id
//       LEFT JOIN ost_thread th ON t.ticket_id = th.object_id AND th.object_type = 'T'
//       GROUP BY s.staff_id, s.firstname
//     `);

//     console.log("Result from DB:", result);

//     // Try both approaches:
//     const rows = Array.isArray(result) ? result : result.rows || result[0] || [];

//     const safeResult = rows.map(row => {
//       const safeRow = {};
//       for (let key in row) {
//         let value = row[key];
//         if (typeof value === 'bigint') {
//           value = Number(value);
//         }
//         if (value === null) {
//           if (key.startsWith('avg') || key === 'closerrate') {
//             value = '0';
//           } else {
//             value = 0;
//           }
//         }
//         safeRow[key] = value;
//       }
//       return safeRow;
//     });

//     res.json(safeResult);
//   } catch (err) {
//     console.error("Error fetching agent performance:", err);
//     res.status(500).json({ error: "Internal Server Error" });
//   }
// };




const db = require("../config/db");

const agentPerformance = async (req, res) => {
    try {
        const result = await db.query(`
      SELECT
        s.staff_id,
        
        CONCAT(s.firstname, ' ', s.lastname) AS name,
        COUNT(t.ticket_id) AS assigned,
        SUM(t.status_id = 3) AS closed,
        CONCAT(ROUND(SUM(t.status_id = 3) / COUNT(t.ticket_id) * 100), '%') AS closerrate,
        TIME_FORMAT(SEC_TO_TIME(AVG(CASE WHEN t.status_id = 3 THEN UNIX_TIMESTAMP(t.closed) - UNIX_TIMESTAMP(t.created) END)), '%H:%i:%s') AS avg_resolution_time,
        
        TIME_FORMAT(SEC_TO_TIME(AVG(
  CASE 
    WHEN t.status_id = 3 THEN UNIX_TIMESTAMP(fr.first_response_time) - UNIX_TIMESTAMP(t.created)
    ELSE NULL
  END
)), '%H:%i:%s') AS avg_response

      FROM ost_staff s
      LEFT JOIN ost_ticket t ON t.staff_id = s.staff_id
      LEFT JOIN (
        -- Subquery to find first response time per ticket
        SELECT 
          ticket.ticket_id,
          MIN(entry.created) AS first_response_time
        FROM ost_ticket ticket
        JOIN ost_thread thread ON thread.object_id = ticket.ticket_id AND thread.object_type = 'T'
        JOIN ost_thread_entry entry ON entry.thread_id = thread.id
        WHERE entry.type = 'R'
        GROUP BY ticket.ticket_id
      ) AS fr ON t.ticket_id = fr.ticket_id
      
      GROUP BY s.staff_id, s.firstname, s.lastname
    `);

        const rows = Array.isArray(result) ? result : result.rows || result[0] || [];

        const safeResult = rows.map(row => {
            const safeRow = {};
            for (let key in row) {
                let value = row[key];
                if (typeof value === 'bigint') {
                    value = Number(value);
                }
                if (value === null) {
                    if (key.startsWith('avg') || key === 'closerrate') {
                        value = '0';
                    } else {
                        value = 0;
                    }
                }
                safeRow[key] = value;
            }
            return safeRow;
        });

        res.json(safeResult);
    } catch (err) {
        console.error("Error fetching agent performance:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// module.exports = { agentPerformance };



// ************************** ***********************************************     Resolution Time Distribution    ***********************************************
// ***************************************              ****************                ****                         ****************          ***********************


const resolutionTimeDistribution = async (req, res) => {
    try {
        const rows = await db.query(`
      SELECT
        UNIX_TIMESTAMP(closed) - UNIX_TIMESTAMP(created) AS resolution_seconds
      FROM ost_ticket
      WHERE status_id = 3 AND closed IS NOT NULL
    `);

        const bins = {
            '< 1 hour': 0,
            '1-4 hours': 0,
            '4-8 hours': 0,
            '8-24 hours': 0,
            '1-3 days': 0,
            '3-7 days': 0,
            '> 7 days': 0,
        };

        rows.forEach(row => {
            const hrs = Number(row.resolution_seconds) / 3600;

            if (hrs < 1) bins['< 1 hour']++;
            else if (hrs <= 4) bins['1-4 hours']++;
            else if (hrs <= 8) bins['4-8 hours']++;
            else if (hrs <= 24) bins['8-24 hours']++;
            else if (hrs <= 72) bins['1-3 days']++;
            else if (hrs <= 168) bins['3-7 days']++;
            else bins['> 7 days']++;
        });


        const data = Object.entries(bins).map(([name, value]) => ({ name, value }));

        res.json(data);
    } catch (err) {
        console.error("Error in resolution time distribution:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

// module.exports = {resolutionTimeDistribution};


// ***************************************  *******************************         Ticket by Category        *****************      *********************
// *************************                     ********************************                        ****************                *************************



const categoryDistribution = async (req, res) => {
    try {
        const rows = await db.query(`
      SELECT 
        h.topic AS name,
        COUNT(t.ticket_id) AS value
      FROM ost_ticket t
      JOIN ost_help_topic h ON t.topic_id = h.topic_id
      GROUP BY h.topic
    `);

        // Convert BigInt to Number
        const formatted = rows.map(row => ({
            name: row.name,
            value: Number(row.value)
        }));

        res.json(formatted);
    } catch (err) {
        console.error("Error fetching category distribution:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};

module.exports = {
    categoryDistribution,
    resolutionTimeDistribution,
    agentPerformance
};
