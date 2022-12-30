import { drive_v3, google } from "googleapis";
import credentials from "../credentials.json";
import { createClient } from "redis";
import { ConcertBase } from "../types";

const scopes = ["https://www.googleapis.com/auth/drive.readonly"];

const auth = new google.auth.JWT(
  credentials.client_email,
  undefined,
  credentials.private_key,
  scopes
);

const drive = google.drive({ version: "v3", auth });

// Translations for venues from how they are stored in Drive
const VenueTranslations = {
  Paradise: "Paradise Rock Club",
  "Middle East": "Middle East",
  Sinclair: "The Sinclair",
  HOB: "House of Blues Boston",
  BMH: "Brighton Music Hall",
  MGM: "MGM Music Hall at Fenway",
};

export interface RedisDetails extends ConcertBase {
  photos: string[];
}

/**
 * Translate a venue into its full name from an abbreviation. If no
 * abbreviation is available, return the name as-is
 * @param v The venue abbreviation/nickname
 * @returns The full venue name
 */
const translateVenue = (v: string) => {
  if (Object.keys(VenueTranslations).includes(v)) {
    return VenueTranslations[v as keyof typeof VenueTranslations];
  } else {
    return v;
  }
};

/**
 * Get all of the folders, images, and shortcuts with the given parent IDs
 * @param parents The parent folder IDs at this level to search
 * @returns The folders, shortcuts, and images at the level of the given parents
 */
const getLevel = async (parents: string[]) => {
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
  const fields =
    "files/mimeType,files/id,files/thumbnailLink,files/name,files/parents,files/shortcutDetails,nextPageToken";

  const files = [];
  let nextPageToken: string | null | undefined = "";

  do {
    const res = (
      await drive.files.list({
        fields: fields,
        q: s,
        pageSize: 1000,
        pageToken: nextPageToken,
      })
    ).data as drive_v3.Schema$FileList;

    if (res.files) {
      files.push(...res.files);
    }

    nextPageToken = res.nextPageToken;
  } while (nextPageToken);

  // Separate folders, shortcuts and images
  const photos: drive_v3.Schema$File[] = [];
  const folders: drive_v3.Schema$File[] = [];
  const shortcuts: drive_v3.Schema$File[] = [];

  files.forEach((file) => {
    if (file.mimeType == "image/jpeg") {
      photos.push(file);
    } else if (file.mimeType == "application/vnd.google-apps.folder") {
      folders.push(file);
    } else {
      shortcuts.push(file);
    }
  });

  return { photos, folders, shortcuts };
};

/**
 * Build the redis database from our Google Drive folder structure
 */
export const buildDatabase = async () => {
  // Create redis client
  const client = createClient();
  await client.connect();

  // Drive starting folder
  const origin = process.env.DRIVE_PARENT_FOLDER!;

  // Level 1: Years, excluding portfolio folder
  const level1 = await getLevel([origin]);
  level1.folders = level1.folders.filter((file) => file.name != "Portfolio");

  // Level 2: Shows
  const level2 = await getLevel(level1.folders.map((folder) => folder.id!));

  // Extract the dates and venues from the names, keep track
  const dates: { [key: string]: { date: string; venue: string } } = {};

  level2.folders.forEach((folder) => {
    const components = folder.name!.split("|");
    dates[folder.id!] = {
      date: new Date(components[0]).toLocaleDateString("en-US", {
        month: "long",
        day: "2-digit",
        year: "numeric",
      }),
      venue: translateVenue(components[2].trim()),
    };
  });

  // Level 3: Get the individual artists from the concert
  const level3 = await getLevel(level2.folders.map((folder) => folder.id!));

  // Create actual concerts from the folder names. This is where we begin storing in our db
  const concertIDs: string[] = [];

  const tempConcerts: { [key: string]: RedisDetails } = {};

  level3.folders.forEach((folder) => {
    tempConcerts[folder.id!] = {
      ...dates[folder.parents![0]],
      id: folder.id!,
      artist: folder.name!,
      photos: [],
    };
    concertIDs.push(folder.id!);
  });

  // Level 4: Get the images
  const level4 = await getLevel(level3.folders.map((folder) => folder.id!));

  // Get porfolio ids
  const portfolioFolder = process.env.DRIVE_PORTFOLIO_FOLDER!;
  const portfolioShortcuts = await getLevel([portfolioFolder]);

  const portfolioIDs = portfolioShortcuts.shortcuts.map(
    (sc) => sc.shortcutDetails!.targetId
  );

  // Clear db
  await client.flushAll();

  // Add artist info to the images and images to concerts
  await Promise.all(
    level4.photos.map(async (photo) => {
      tempConcerts[photo.parents![0]].photos.push(photo.id!);
      const concert = tempConcerts[photo.parents![0]];
      const photoInfo = {
        id: photo.id,
        url: photo.thumbnailLink,
        artist: concert.artist,
        venue: concert.venue,
        date: concert.date,
      };
      await client.set(photo.id!, JSON.stringify(photoInfo));
    })
  );

  // Keep track of concert IDs for retrieval later
  await client.set("concerts", JSON.stringify(concertIDs));

  // Add portfolio images
  await client.set("portfolio", JSON.stringify(portfolioIDs));

  // Add finalized concerts
  await Promise.all(
    Object.keys(tempConcerts).map(async (key) => {
      await client.set(key, JSON.stringify(tempConcerts[key]));
    })
  );
};
