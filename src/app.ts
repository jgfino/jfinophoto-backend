import express, { NextFunction, Request, Response } from "express";
import routes from "./routes";
import dotenv from "dotenv";
import cron from "node-cron";
import { buildDatabase } from "./api/googleDrive";

dotenv.config();

const app = express();
const port = 3001;

app.use("/api/v1", routes);

app.all("*", (req, res, next) => {
  res.status(404).send("Route not found");
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.log(err);
  res.status(500).send("An internal server error occured");
});

app.listen(port, () => {
  buildDatabase().then(() =>
    console.log(`Express is listening at http://localhost:${port}`)
  );
});

/**
 * Rebuild the database every hour
 */
cron.schedule("0 * * * *", async () => {
  try {
    await buildDatabase();
    console.log("Successfully re-generated database");
  } catch (e) {
    console.log("There was an error generating the Google Drive database");
  }
});
