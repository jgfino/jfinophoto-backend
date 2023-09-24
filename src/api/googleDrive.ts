import { drive_v3, google } from "googleapis";
import credentials from "../credentials.json";
import { createClient } from "redis";
import { Concert, ConcertImage, ConcertWithPhotos } from "../types";

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
  Sinclair: "The Sinclair",
  HOB: "House of Blues Boston",
  BMH: "Brighton Music Hall",
  MGM: "MGM Music Hall at Fenway",
  BNL: "Big Night Live",
  MSG: "Madison Square Garden",
};

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
 * Get the photos in a gallery
 */
export const getGallery = async (
  concertFolderId: string,
  artistFolderId: string,
  isFest: boolean
): Promise<ConcertWithPhotos> => {
  const concertFolder = await drive.files.get({
    fileId: concertFolderId,
    fields: "name",
  });

  const artistFolder = await drive.files.get({
    fileId: artistFolderId,
    fields: "name",
  });

  const folderName = concertFolder.data.name!;

  const split = folderName.split(" | ");
  const date = split[0];
  const artistPart = split[1];
  const venue = translateVenue(split[2].trim());

  const artist = isFest
    ? `${artistFolder.data.name!} - ${artistPart}`
    : artistFolder.data.name!;

  const drivePhotos = (await getLevel(artistFolderId)).photos;
  const photos: ConcertImage[] = drivePhotos.map((p) => ({
    id: p.id!,
    url: p.thumbnailLink!,
    artist: artist,
    venue: venue,
    date: new Date(date).toLocaleString("en-US", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
  }));
  return {
    date,
    venue,
    artist,
    id: concertFolderId,
    photos,
  };
};

/**
 * Get the galleries associated with a given folder
 */
const getGalleries = async (folder: string): Promise<Concert[]> => {
  const { folders } = await getLevel(folder); // years
  const concerts: drive_v3.Schema$File[] = [];

  // concerts
  for (const folder of folders) {
    const { folders: f } = await getLevel(folder.id!);
    concerts.push(...f);
  }

  const details: Concert[] = [];

  const isFestival = folder === process.env.DRIVE_FESTIVAL_FOLDER!;

  // concerts
  for (const concert of concerts) {
    const split = concert.name!.split(" | ");
    const date = split[0];
    const festName = split[1];
    const location = translateVenue(split[2].trim());

    const artistFolders = (await getLevel(concert.id!)).folders!;
    for (const artistFolder of artistFolders) {
      details.push({
        id: concert.id!,
        artistId: artistFolder.id!,
        artist: isFestival
          ? `${artistFolder.name} - ${festName}`
          : artistFolder.name!,
        date: date,
        venue: location,
      });
    }
  }

  return details.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
};

/**
 * Get all of the folders, images, and shortcuts with the given parent IDs
 */
const getLevel = async (parent: string) => {
  let s = `(mimeType='application/vnd.google-apps.folder' OR mimeType='application/vnd.google-apps.shortcut' OR mimeType='image/jpeg')`;
  s += ` AND ('${parent}' IN parents)`;

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
 * Get concert info based on a single image's folder structure
 */
const mapConcertFolder = async (folder: drive_v3.Schema$File[]) => {
  return await Promise.all(
    folder.map(async (sc) => {
      const originalFileId = sc.shortcutDetails!.targetId;
      const originalFile = await drive.files.get({
        fileId: originalFileId,
        fields: "parents,thumbnailLink",
      });
      const artistFolderId = originalFile.data.parents![0];
      const artistFolder = await drive.files.get({
        fileId: artistFolderId,
        fields: "parents,name",
      });
      const concertFolderId = artistFolder.data.parents![0];
      const concertFolder = await drive.files.get({
        fileId: concertFolderId,
        fields: "name",
      });

      const split = concertFolder.data.name!.split(" | ");
      const date = split[0];
      const artist = artistFolder.data.name!;
      const venue = translateVenue(split[2].trim());

      const photoInfo: ConcertImage = {
        id: originalFileId!,
        url: originalFile.data.thumbnailLink!,
        artist: artist,
        venue: venue,
        date: new Date(date).toLocaleString("en-US", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }),
      };

      return photoInfo;
    })
  );
};

/**
 * Build the redis database from our Google Drive folder structure
 *
 * This stores portfolio photos in redis. Individual concert galleries are
 * fetched on demand from the Google Drive API to prevent the redis database
 * from getting too large.
 */
export const buildDatabase = async () => {
  // Create redis client
  const client = createClient();
  await client.connect();
  // Clear db
  await client.flushAll();

  const portfolioFolder = process.env.DRIVE_PORTFOLIO_CONCERT_FOLDER!;
  const portfolioShortcuts = (await getLevel(portfolioFolder)).shortcuts;

  const portraitFolder = process.env.DRIVE_PORTFOLIO_PORTRAIT_FOLDER!;
  const portraitShortcuts = (await getLevel(portraitFolder)).shortcuts;

  const festivalFolder = process.env.DRIVE_FESTIVAL_FOLDER!;
  const festivalShortcuts = (await getLevel(festivalFolder)).shortcuts;

  const concertMapped = await mapConcertFolder(portfolioShortcuts);
  const portraitMapped = await mapConcertFolder(portraitShortcuts);
  const festivalMapped = await mapConcertFolder(festivalShortcuts);

  // Keep just the metadata for the galleries, not the photos
  const concertGalleries = await getGalleries(
    process.env.DRIVE_CONCERT_FOLDER!
  );

  const festivalGalleries = await getGalleries(
    process.env.DRIVE_FESTIVAL_FOLDER!
  );

  // Set all image ids in redis
  [...concertMapped, ...portraitMapped, ...festivalMapped].forEach(
    async (photo) => {
      await client.set(photo.id, JSON.stringify(photo));
    }
  );

  // Set folder mappings
  await client.set("concerts", JSON.stringify(concertMapped.map((c) => c.id)));
  await client.set(
    "portraits",
    JSON.stringify(portraitMapped.map((c) => c.id))
  );
  await client.set(
    "festivals",
    JSON.stringify(festivalMapped.map((c) => c.id))
  );

  // Set gallery mappings
  await client.set("concertGalleries", JSON.stringify(concertGalleries));

  await client.set("festivalGalleries", JSON.stringify(festivalGalleries));
};
