const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard');
const dashboardChartData = require('../controllers/dashboard');
const agentPerformance = require('../controllers/ticketSystem');
const resolutionTimeDistribution = require('../controllers/ticketSystem');
const categoryDistribution = require('../controllers/ticketSystem');

const {getChartData} = require('../controllers/dashboard');

// *************    second time 
// const { getTicketSummary, getTicketVolume } = require('../controllers/dashboard')


router.get('/agentperformance', agentPerformance.agentPerformance);
router.get('/resolutiontimedistribution', resolutionTimeDistribution.resolutionTimeDistribution);
router.get('/categoryTicket', categoryDistribution.categoryDistribution)

router.get('/dashboard', dashboardController.getDashboardData);
router.get('/dashboardchart', dashboardChartData.dashboardChartData)

router.get('/chartdata', getChartData);


// *****************    second time
// router.get('/dashboardsecondsummery', getTicketSummary)
// router.get('/dashboardsecondvalume', getTicketVolume)



module.exports = router;
