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
const express_1 = __importDefault(require("express"));
const routes_1 = __importDefault(require("./routes"));
const dotenv_1 = __importDefault(require("dotenv"));
const node_cron_1 = __importDefault(require("node-cron"));
const googleDrive_1 = require("./api/googleDrive");
const cors_1 = __importDefault(require("cors"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT;
const address = process.env.ADDRESS;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use("/api/v1", routes_1.default);
// Route not found
app.all("*", (req, res, next) => {
    res.status(404).send("Route not found");
});
// Generic error wrapping
app.use((err, req, res, next) => {
    console.log(err);
    res.status(500).send("An internal server error occured");
});
// Start app and build initial database
app.listen(port, () => {
    console.log("Building database");
    (0, googleDrive_1.buildDatabase)().then(() => console.log(`Express is listening at ${address}:${port}`));
});
/**
 * Rebuild the database every hour
 */
node_cron_1.default.schedule("0 * * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Rebuilding database");
        yield (0, googleDrive_1.buildDatabase)();
        console.log("Successfully rebuilt database");
    }
    catch (e) {
        console.log("There was an error generating the Google Drive database: " + e);
    }
}));
//# sourceMappingURL=app.js.map