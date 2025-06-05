const express = require('express');
const router = express.Router();
const { agentPerformance,
    categoryDistribution,
    resolutionTimeDistribution } = require('../controllers/ticketSystem');


router.get('/agentperformance', agentPerformance);
router.get('/categoryTicket', categoryDistribution);
router.get('/resolutiontimedistribution', resolutionTimeDistribution);

module.exports = router;
