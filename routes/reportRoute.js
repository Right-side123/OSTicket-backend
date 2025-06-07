const express = require('express');
const router = express.Router();
const { ticketVolume,
    agentPerformance,
    resolutionTime,
    slaCompliance,
    customerSatisfaction,
    helpTopicDistribution } = require('../controllers/Report');

router.get('/ticket-volume', ticketVolume);

router.get('/agent-performance-report', agentPerformance);

router.get('/resolution-time-report', resolutionTime);

router.get('/sla-compliance', slaCompliance);

router.get('/customer-satisfaction', customerSatisfaction);

router.get('/help-topic-distribution', helpTopicDistribution);

module.exports = router;
