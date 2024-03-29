import { catchAsync } from "./error/catchAsync";
import { createClient } from "redis";
import nodemailer from "nodemailer";
import { ConcertImage } from "./types";
import { getGallery } from "./api/googleDrive";

/**
 * Shuffle an array
 * @param arr The array to shuffle
 * @returns The shuffled array
 */
export function shuffle<T>(arr: T[]) {
  const array = [...arr];
  let i = array.length - 1;
  for (i; i > 0; i--) {
    const j = Math.floor(Math.random() * i);
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
}

/**
 * Fix thumbnail url sizing
 * @param url The url to fix
 * @returns The fixed url
 */
const fixThumbnailUrl = (url: string, size: number) => {
  return url.replace("=s220", `=s${size}`);
};

/**
 * Get all images in a redis cache based on key and format as concert images
 * @param key The redis cache key
 * @returns The formatted images
 */
const getRedisImages = async (key: string) => {
  const client = createClient();
  await client.connect();

  const imageIDs: string[] = JSON.parse((await client.get(key))!);
  const images: ConcertImage[] = [];
  await Promise.all(
    imageIDs.map(async (id) => {
      const image: ConcertImage = JSON.parse((await client.get(id))!);
      if (image === null) {
        return;
      }
      image.url = fixThumbnailUrl(image.url, 1600);
      images.push(image);
    })
  );

  await client.disconnect();

  return images;
};

/**
 * Get all concerts in a redis cache based on key and format as concert objects
 * @param key The redis cache key
 * @returns The formatted concerts
 */
const getRedisConcerts = async (key: string) => {
  const client = createClient();
  await client.connect();

  const concerts = JSON.parse((await client.get(key))!);

  await client.disconnect();

  return concerts;
};

/**
 * Get all images in the portfolio
 */
export const getConcerts = catchAsync(async (_, res) => {
  const images = await getRedisImages("concerts");
  res.status(200).send(shuffle(images));
});

/**
 * Get all images in the portrait portfolio
 */
export const getPortraits = catchAsync(async (_, res) => {
  const images = await getRedisImages("portraits");
  res.status(200).send(shuffle(images));
});

/**
 * Get all images in the festival portfolio
 */
export const getFestivals = catchAsync(async (_, res) => {
  const images = await getRedisImages("festivals");
  res.status(200).send(shuffle(images));
});

/**
 * Get all concerts in date order
 */
export const getConcertGalleries = catchAsync(async (_, res) => {
  const concerts = await getRedisConcerts("concertGalleries");
  res.status(200).send(concerts);
});

/**
 * Get all festival galleries
 */
export const getFestivalGalleries = catchAsync(async (_, res) => {
  const galleries = await getRedisConcerts("festivalGalleries");
  res.status(200).send(galleries);
});

/**
 * Get a specific concert or festival and its photos
 */
export const getPhotos = catchAsync(async (req, res) => {
  const concertId = req.params.concertId ?? req.params.festId;
  const isFest = req.params.festId !== undefined;
  const artistId = req.params.artistId;
  const concertDetails = await getGallery(concertId, artistId, isFest);
  concertDetails.photos = shuffle(concertDetails.photos); // shuffle photos
  res.status(200).send(concertDetails);
});

/**
 * Send an email from the contact form
 */
export const sendEmail = catchAsync(async (req, res) => {
  const { firstName, lastName, subject, email, message } = req.body;
  console.log(req.body);

  if (
    !(firstName && lastName && subject && email && message) ||
    message.length > 500
  ) {
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

  const mailer = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.GMAIL_ADDRESS,
      pass: process.env.GMAIL_PASSWORD,
    },
  });

  mailer.sendMail({ ...mail, to: process.env.GMAIL_DEST }, (err, info) => {
    if (err) {
      console.log(info);
      throw err;
    } else {
      console.log(info);
      res.status(200).send("Success");
    }
  });
});
