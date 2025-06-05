const express = require('express');
const router = express.Router();
const { getDashboardData,
    getChartData } = require('../controllers/dashboard');

router.get('/dashboard', getDashboardData);

router.get('/chartdata', getChartData);

module.exports = router;
