const db = require('../config/db');

const ticketVolume = async (req, res) => {
    const { from, to } = req.query;
    try {
        // console.log('From:', from, 'To:', to);
        const rows = await db.query(
            `SELECT DATE(created) as date, COUNT(*) as count
             FROM ost_ticket
             WHERE created BETWEEN ? AND ?
             GROUP BY DATE(created)
             ORDER BY DATE(created)`,
            [from, to]
        );

        // console.log(rows);

        const formatted = Array.isArray(rows)
            ? rows.map(row => ({
                date: row.date instanceof Date
                    ? row.date.toISOString().slice(0, 10)
                    : row.date,
                count: typeof row.count === 'bigint'
                    ? Number(row.count)
                    : Number(row.count)
            }))
            : [];

        // const formatted = Array.isArray(rows)
        //     ? rows.map(row => ({
        //         ...row,
        //         count: Number(row.count)
        //     }))
        //     : [];
        res.json(formatted);
    } catch (error) {
        console.error("Ticket Volume Error: ", error);
        res.status(500).json({ message: 'Error fetching ticket volume', error });
    }
};


// ******************************************************************************                  Agent Performance Report

// ***********                   Only those agents will come who have the data    ******

const agentPerformance = async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT s.firstname, s.lastname, s.username,
                   COUNT(t.ticket_id) AS tickets_assigned,
                   SUM(CASE WHEN t.status_id = 3 THEN 1 ELSE 0 END) AS tickets_closed,
                   AVG(UNIX_TIMESTAMP(t.closed) - UNIX_TIMESTAMP(t.created)) AS avg_resolution_time
            FROM ost_ticket t
            JOIN ost_staff s ON t.staff_id = s.staff_id
            WHERE t.staff_id IS NOT NULL
            GROUP BY t.staff_id
        `);
        // console.log(rows);
        const formatted = Array.isArray(rows)
            ? rows.map(row => ({
                ...row,
                tickets_assigned: Number(row.tickets_assigned),
                tickets_closed: Number(row.tickets_closed),
                avg_resolution_time: Number(row.avg_resolution_time)
            }))
            : [];

        res.json(formatted);
    } catch (error) {
        console.error("Ticket Volume Error: ", error);
        res.status(500).json({ message: 'Error fetching agent performance', error });
    }
};


// ****************  *********************                  all agent ********

// const agentPerformance = async (req, res) => {
//     try {
//         const rows = await db.query(`
//             SELECT 
//   s.firstname, s.lastname, s.username,
//   COUNT(t.ticket_id) AS tickets_assigned,
//   SUM(CASE WHEN t.status_id = 3 THEN 1 ELSE 0 END) AS tickets_closed,
//   AVG(UNIX_TIMESTAMP(t.closed) - UNIX_TIMESTAMP(t.created)) AS avg_resolution_time
// FROM ost_staff s
// LEFT JOIN ost_ticket t ON t.staff_id = s.staff_id
// GROUP BY s.staff_id;
//         `);
//         console.log(rows);
//         const formatted = Array.isArray(rows)
//             ? rows.map(row => ({
//                 ...row,
//                 tickets_assigned: Number(row.tickets_assigned),
//                 tickets_closed: Number(row.tickets_closed),
//                 avg_resolution_time: Number(row.avg_resolution_time)
//             }))
//             : [];

//         res.json(formatted);
//     } catch (error) {
//         console.error("Ticket Volume Error: ", error);
//         res.status(500).json({ message: 'Error fetching agent performance', error });
//     }
// };


// *************************************************************************************                  Resolution Time Report

const resolutionTime = async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT ticket_id, created, closed,
                   TIMESTAMPDIFF(SECOND, created, closed) AS resolution_seconds
            FROM ost_ticket
            WHERE status_id = 3 AND closed IS NOT NULL
        `);
        // console.log(rows);

        const formatted = Array.isArray(rows)
            ? rows.map(row => ({
                ...row,
                resolution_seconds: Number(row.resolution_seconds)
            }))
            : [];
        res.json(formatted);
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error fetching resolution time', error });
    }
};


// ****************************************************************************************                  SLA Compliance Report

const slaCompliance = async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT t.ticket_id, t.created, t.duedate, t.closed,
                   CASE 
                       WHEN t.closed <= t.duedate THEN 'Compliant'
                       ELSE 'Violated'
                   END AS sla_status
            FROM ost_ticket t
            WHERE t.duedate IS NOT NULL AND t.closed IS NOT NULL
        `);

        // console.log(rows);

        const formatted = Array.isArray(rows)
            ? rows.map(row => ({
                ...row,
                created: new Date(row.created).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }),
                duedate: new Date(row.duedate).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }),
                closed: new Date(row.closed).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                })
            }))
            : [];

        res.json(formatted);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching SLA compliance', error });
    }
};


// ******************************************************************************************                   Customer Satisfaction Report

//        ***************     Pending for plugins install -->    ost_survey_response   table note store in database

const customerSatisfaction = async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT sr.ticket_id, sr.updated, sr.response, s.title
            FROM ost_survey_response sr
            JOIN ost_survey s ON sr.survey_id = s.id
            ORDER BY sr.updated DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error fetching customer satisfaction', error });
    }
};


//  **********************************************************************************************                        Help Topic Distribution Report

const helpTopicDistribution = async (req, res) => {
    try {
        const rows = await db.query(`
            SELECT ht.topic, COUNT(t.ticket_id) as total_tickets
            FROM ost_ticket t
            JOIN ost_help_topic ht ON t.topic_id = ht.topic_id
            GROUP BY ht.topic
        `);

        // console.log(rows);

        const formatted = Array.isArray(rows)
            ? rows.map(row => ({
                ...row,
                total_tickets: Number(row.total_tickets)
            }))
            : [];


        res.json(formatted);
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Error fetching help topic distribution', error });
    }
};

module.exports = {
    ticketVolume,
    agentPerformance,
    resolutionTime,
    slaCompliance,
    customerSatisfaction,
    helpTopicDistribution
};
