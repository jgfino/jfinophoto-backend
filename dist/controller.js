"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = exports.getConcert = exports.getConcerts = exports.getPortfolio = void 0;
const catchAsync_1 = require("./error/catchAsync");
const redis_1 = require("redis");
const nodemailer_1 = __importDefault(require("nodemailer"));
/**
 * Fix thumbnail url sizing
 * @param url The url to fix
 * @returns The fixed url
 */
const fixThumbnailUrl = (url, size) => {
    return url.replace("=s220", `=s${size}`);
};
/**
 * Get all images in my portfolio
 */
exports.getPortfolio = (0, catchAsync_1.catchAsync)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const client = (0, redis_1.createClient)();
    yield client.connect();
    const imageIDs = JSON.parse((yield client.get("portfolio")));
    const images = [];
    yield Promise.all(imageIDs.map((id) => __awaiter(void 0, void 0, void 0, function* () {
        const image = JSON.parse((yield client.get(id)));
        image.url = fixThumbnailUrl(image.url, 1280);
        images.push(image);
    })));
    res.status(200).send(images);
}));
/**
 * Get all concerts in date order, each with a random cover image
 */
exports.getConcerts = (0, catchAsync_1.catchAsync)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const client = (0, redis_1.createClient)();
    yield client.connect();
    const concertIDs = JSON.parse((yield client.get("concerts")));
    const concerts = [];
    yield Promise.all(concertIDs.map((id) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const concert = JSON.parse((yield client.get(id)));
        const coverImageID = concert.photos[Math.floor(Math.random() * concert.photos.length)];
        const coverImage = JSON.parse((yield client.get(coverImageID)));
        coverImage.url = fixThumbnailUrl(coverImage.url, 500);
        const { photos } = concert, preview = __rest(concert, ["photos"]);
        concerts.push(Object.assign(Object.assign({}, preview), { coverImage: (_a = coverImage.url) !== null && _a !== void 0 ? _a : null }));
    })));
    // Sort concerts chronologically
    concerts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.status(200).send(concerts);
}));
/**
 * Get a specific concert and its photos
 */
exports.getConcert = (0, catchAsync_1.catchAsync)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const client = (0, redis_1.createClient)();
    yield client.connect();
    const concertID = req.params.id;
    const concert = JSON.parse((yield client.get(concertID)));
    const photoIDs = concert.photos;
    const photos = [];
    yield Promise.all(photoIDs.map((id) => __awaiter(void 0, void 0, void 0, function* () {
        const photo = JSON.parse((yield client.get(id)));
        photo.url = fixThumbnailUrl(photo.url, 1280);
        photos.push(photo.url);
    })));
    concert.photos = photos;
    res.status(200).send(concert);
}));
/**
 * Send an email from the contact form
 */
exports.sendEmail = (0, catchAsync_1.catchAsync)((req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const { firstName, lastName, subject, email, message } = req.body;
    if (!(firstName && lastName && subject && email && message) ||
        message.length > 500) {
        return res.status(400).send("Missing required fields");
    }
    const mail = {
        from: `${req.body.firstName} ${req.body.lastName}`,
        subject: `PHOTO WEBSITE INQUIRY - ${req.body.subject}`,
        html: `<p>Name: ${req.body.firstName} ${req.body.lastName}</p>
           <p>Subject: ${req.body.subject}</p>
           <p>Email: ${req.body.email}</p>
           <p>Message: ${req.body.message}</p>`,
    };
    const mailer = nodemailer_1.default.createTransport({
        service: "gmail",
        auth: {
            user: process.env.GMAIL_ADDRESS,
            pass: process.env.GMAIL_PASSWORD,
        },
    });
    mailer.sendMail(Object.assign(Object.assign({}, mail), { to: process.env.GMAIL_DEST }), (err, info) => {
        if (err) {
            console.log(info);
            throw err;
        }
        else {
            console.log(info);
            res.status(200).send("Success");
        }
    });
}));
//# sourceMappingURL=controller.js.map