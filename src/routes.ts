import * as actions from "./controller";
import express from "express";

const router = express.Router();

router.get("/portfolio", actions.getPortfolio);

router.get("/portraits", actions.getPortraits);

router.get("/concerts", actions.getConcerts);

router.get("/concerts/:id", actions.getConcert);

router.post("/contact", actions.sendEmail);

export default router;
