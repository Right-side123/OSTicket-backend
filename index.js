const express = require("express");
const cors = require("cors");
require("dotenv").config();

const dashboardRoute = require("./routes/dashboardRoute");
const ticketSystemRoute = require("./routes/ticketSystemRoute")
const reportRoute = require('./routes/reportRoute')

const app = express();
const port = process.env.PORT;


app.use(cors());
app.use(express.json());


app.use("/api", dashboardRoute);
app.use("/api", ticketSystemRoute);
app.use("/api", reportRoute);


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
