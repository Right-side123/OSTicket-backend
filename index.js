const express = require("express");
const cors = require("cors");
require("dotenv").config();



const dashboardRoute = require("./routes/dashboardRoute");
const ticketSystemRoute = require("./routes/ticketSystemRoute")
const app = express();
const port = process.env.PORT;
// const agentPerformaneRoute = require("./routes/ticketSystemRoute");


app.use(cors());
app.use(express.json());


app.use("/api", dashboardRoute);
app.use("/api", ticketSystemRoute);


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
