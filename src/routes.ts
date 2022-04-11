import * as actions from "./controller";
import express from "express";
import { buildDatabase } from "./api/googleDrive";

const router = express.Router();

router.get("/portfolio", actions.getPortfolio);

router.get("/concerts", actions.getConcerts);

router.get("/concerts/:id", actions.getConcert);

export default router;
