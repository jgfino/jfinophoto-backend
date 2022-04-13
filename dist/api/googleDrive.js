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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDatabase = void 0;
const googleapis_1 = require("googleapis");
const credentials_json_1 = __importDefault(require("../credentials.json"));
const redis_1 = require("redis");
const scopes = ["https://www.googleapis.com/auth/drive.readonly"];
const auth = new googleapis_1.google.auth.JWT(credentials_json_1.default.client_email, undefined, credentials_json_1.default.private_key, scopes);
const drive = googleapis_1.google.drive({ version: "v3", auth });
// Translations for venues from how they are stored in Drive
const VenueTranslations = {
    Paradise: "Paradise Rock Club",
    "Middle East": "Middle East",
    Sinclair: "The Sinclair",
    HOB: "House of Blues",
    BMH: "Brighton Music Hall",
};
/**
 * Translate a venue into its full name from an abbreviation. If no
 * abbreviation is available, return the name as-is
 * @param v The venue abbreviation/nickname
 * @returns The full venue name
 */
const translateVenue = (v) => {
    if (Object.keys(VenueTranslations).includes(v)) {
        return VenueTranslations[v];
    }
    else {
        return v;
    }
};
/**
 * Get all of the folders, images, and shortcuts with the given parent IDs
 * @param parents The parent folder IDs at this level to search
 * @returns The folders, shortcuts, and images at the level of the given parents
 */
const getLevel = (parents) => __awaiter(void 0, void 0, void 0, function* () {
    let s = `(mimeType='application/vnd.google-apps.folder' OR mimeType='application/vnd.google-apps.shortcut' OR mimeType='image/jpeg')`;
    if (parents.length == 0) {
        return { photos: [], folders: [], shortcuts: [] };
    }
    s += ` AND (`;
    parents.forEach((parent) => {
        s += `'${parent}' IN parents OR`;
    });
    s = s.substring(0, s.length - 3);
    s += `)`;
    const fields = "files/mimeType,files/id,files/thumbnailLink,files/name,files/parents,files/shortcutDetails,nextPageToken";
    const files = [];
    let nextPageToken = "";
    do {
        const res = (yield drive.files.list({
            fields: fields,
            q: s,
            pageSize: 1000,
            pageToken: nextPageToken,
        })).data;
        if (res.files) {
            files.push(...res.files);
        }
        nextPageToken = res.nextPageToken;
    } while (nextPageToken);
    // Separate folders, shortcuts and images
    const photos = [];
    const folders = [];
    const shortcuts = [];
    files.forEach((file) => {
        if (file.mimeType == "image/jpeg") {
            photos.push(file);
        }
        else if (file.mimeType == "application/vnd.google-apps.folder") {
            folders.push(file);
        }
        else {
            shortcuts.push(file);
        }
    });
    return { photos, folders, shortcuts };
});
/**
 * Build the redis database from our Google Drive folder structure
 */
const buildDatabase = () => __awaiter(void 0, void 0, void 0, function* () {
    // Create redis client
    const client = (0, redis_1.createClient)();
    yield client.connect();
    yield client.flushAll();
    // Drive starting folder
    const origin = process.env.DRIVE_PARENT_FOLDER;
    // Level 1: Years, excluding portfolio folder
    const level1 = yield getLevel([origin]);
    level1.folders = level1.folders.filter((file) => file.name != "Portfolio");
    // Level 2: Shows
    const level2 = yield getLevel(level1.folders.map((folder) => folder.id));
    // Extract the dates and venues from the names, keep track
    const dates = {};
    level2.folders.forEach((folder) => {
        const components = folder.name.split("|");
        dates[folder.id] = {
            date: new Date(components[0]).toLocaleDateString("en-US", {
                month: "long",
                day: "2-digit",
                year: "numeric",
            }),
            venue: translateVenue(components[2].trim()),
        };
    });
    // Level 3: Get the individual artists from the concert
    const level3 = yield getLevel(level2.folders.map((folder) => folder.id));
    // Create actual concerts from the folder names. This is where we begin storing in our db
    const concertIDs = [];
    const tempConcerts = {};
    level3.folders.forEach((folder) => {
        tempConcerts[folder.id] = Object.assign(Object.assign({}, dates[folder.parents[0]]), { id: folder.id, artist: folder.name, photos: [] });
        concertIDs.push(folder.id);
    });
    // Keep track of concert IDs for retrieval later
    yield client.set("concerts", JSON.stringify(concertIDs));
    // Level 4: Get the images
    const level4 = yield getLevel(level3.folders.map((folder) => folder.id));
    // Add artist info to the images and images to concerts
    yield Promise.all(level4.photos.map((photo) => __awaiter(void 0, void 0, void 0, function* () {
        tempConcerts[photo.parents[0]].photos.push(photo.id);
        const concert = tempConcerts[photo.parents[0]];
        const photoInfo = {
            id: photo.id,
            url: photo.thumbnailLink,
            artist: concert.artist,
            venue: concert.venue,
            date: concert.date,
        };
        yield client.set(photo.id, JSON.stringify(photoInfo));
    })));
    const portfolioFolder = process.env.DRIVE_PORTFOLIO_FOLDER;
    const portfolioShortcuts = yield getLevel([portfolioFolder]);
    const portfolioIDs = portfolioShortcuts.shortcuts.map((sc) => sc.shortcutDetails.targetId);
    // Add portfolio images
    yield client.set("portfolio", JSON.stringify(portfolioIDs));
    // Add finalized concerts
    yield Promise.all(Object.keys(tempConcerts).map((key) => __awaiter(void 0, void 0, void 0, function* () {
        yield client.set(key, JSON.stringify(tempConcerts[key]));
    })));
});
exports.buildDatabase = buildDatabase;
//# sourceMappingURL=googleDrive.js.map