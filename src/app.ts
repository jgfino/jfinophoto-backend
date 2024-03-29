import express, { Request, Response } from "express";
import routes from "./routes";
import dotenv from "dotenv";
import cron from "node-cron";
import { buildDatabase } from "./api/googleDrive";
import cors from "cors";

dotenv.config();

const app = express();
const port = process.env.PORT;

app.use(cors());
app.use(express.json());

app.use("/", routes);

// Route not found
app.all("*", (_, res) => {
  res.status(404).send("Route not found");
});

// Generic error wrapping
app.use((err: Error, req: Request, res: Response) => {
  console.log(err);
  res.status(500).send("An internal server error occured");
});

// Start app and build initial database
app.listen(port, () => {
  console.log("Building database");
  buildDatabase().then(() =>
    console.log(`Express is listening on port ${port}`)
  );
});

// once per hour
cron.schedule("0 * * * *", () => {
  console.log("Building database");
  buildDatabase();
});
