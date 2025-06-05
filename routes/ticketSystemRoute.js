const express = require('express');
const router = express.Router();
const agentPerformance = require('../controllers/ticketSystem');


router.get('/dashboard', agentPerformance);

module.exports = router;
