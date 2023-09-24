import * as actions from "./controller";
import express from "express";

const router = express.Router();

// Portfolio (in-memory, public) routes

router.get("/live", actions.getConcerts);

router.get("/portraits", actions.getPortraits);

router.get("/festivals", actions.getFestivals);

// "Hidden" routes to display all photos on demand

router.get("/galleries/festivals", actions.getFestivalGalleries);

router.get("/galleries/festivals/:festId/:artistId", actions.getPhotos);

router.get("/galleries/concerts", actions.getConcertGalleries);

router.get("/galleries/concerts/:concertId/:artistId", actions.getPhotos);

// Other pages

router.post("/contact", actions.sendEmail);

export default router;
