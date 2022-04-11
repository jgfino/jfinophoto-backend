import { google } from "googleapis";
import credentials from "../credentials.json";
import { createClient } from "redis";

const scopes = ["https://www.googleapis.com/auth/drive.readonly"];

const auth = new google.auth.JWT(
  credentials.client_email,
  null,
  credentials.private_key,
  scopes
);

const drive = google.drive({ version: "v3", auth });

const VenueTranslations = {
  Paradise: "Paradise Rock Club",
  "Middle East": "Middle East",
  Sinclair: "The Sinclair",
  HOB: "House of Blues",
  BMH: "Brighton Music Hall",
};

const translateVenue = (v: string) => {
  if (Object.keys(VenueTranslations).includes(v)) {
    return VenueTranslations[v];
  } else {
    return v;
  }
};

/**
 * Get the next level of folders in Google Drive
 * @param parents The parent folder IDs at this level to search
 * @returns The folders and images at the level of the given parents
 */
const getLevel = async (parents: string[]) => {
  let s = `(mimeType='application/vnd.google-apps.folder' OR mimeType='image/jpeg')`;
  if (parents.length == 0) {
    return { photos: [], folders: [] };
  }
  s += ` AND (`;
  parents.forEach((parent) => {
    s += `'${parent}' IN parents OR`;
  });
  s = s.substring(0, s.length - 3);
  s += `)`;
  const fields =
    "files/mimeType,files/id,files/thumbnailLink,files/name,files/parents,nextPageToken";

  const files = [];
  let nextPageToken = "";

  do {
    let res = await drive.files.list({
      fields: fields,
      q: s,
      pageSize: 1000,
      pageToken: nextPageToken,
    });
    files.push(...res.data.files);
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  // Separate folders and images
  const photos = [];
  const folders = [];
  files.forEach((file) => {
    if (file.mimeType == "image/jpeg") {
      photos.push(file);
    } else {
      folders.push(file);
    }
  });
  return { photos, folders };
};

/**
 * Fix thumbnail url sizing
 * @param url The url to fix
 * @returns The fixed url
 */
const fixThumbnailUrl = (url: string) => {
  return url.replace("=s220", "=s500");
};

/**
 * Build the redis database from our Google Drive folder structure
 */
export const buildDatabase = async () => {
  const client = createClient();
  await client.connect();
  await client.flushAll();

  const origin = process.env.DRIVE_PARENT_FOLDER;

  // Level 1: Years
  const level1 = await getLevel([origin]);

  // Level 2: Shows
  const level2 = await getLevel(level1.folders.map((folder) => folder.id));

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
  const level3 = await getLevel(level2.folders.map((folder) => folder.id));

  // Create actual concerts from the folder names. This is where we begin storing in our db
  const concertIDs = [];
  const tempConcerts = {};
  level3.folders.forEach((folder) => {
    tempConcerts[folder.id] = {
      ...dates[folder.parents[0]],
      id: folder.id,
      artist: folder.name,
      photos: [],
    };
    concertIDs.push(folder.id);
  });

  // Keep track of concert IDs for retrieval later
  await client.set("concerts", JSON.stringify(concertIDs));

  // Level 4: Get the images
  const level4 = await getLevel(level3.folders.map((folder) => folder.id));

  // Add artist info to the images and images to concerts
  const portfolioIDs = [];
  await Promise.all(
    level4.photos.map(async (photo) => {
      tempConcerts[photo.parents[0]].photos.push(photo.id);
      const concert = tempConcerts[photo.parents[0]];
      const photoInfo = {
        id: photo.id,
        url: fixThumbnailUrl(photo.thumbnailLink),
        artist: concert.artist,
        venue: concert.venue,
        date: concert.date,
      };
      portfolioIDs.push(photo.id);
      await client.set(photo.id, JSON.stringify(photoInfo));
    })
  );

  portfolioIDs.sort(() => Math.random() - 0.5);
  await client.set("portfolio", JSON.stringify(portfolioIDs.slice(0, 30)));

  // Add finalized concerts
  await Promise.all(
    Object.keys(tempConcerts).map(async (key) => {
      await client.set(key, JSON.stringify(tempConcerts[key]));
    })
  );
};
