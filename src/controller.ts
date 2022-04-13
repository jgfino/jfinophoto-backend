import { catchAsync } from "./error/catchAsync";
import { createClient } from "redis";
import nodemailer from "nodemailer";
import { ConcertDetails, ConcertImage, ConcertPreview } from "./types";

/**
 * Fix thumbnail url sizing
 * @param url The url to fix
 * @returns The fixed url
 */
const fixThumbnailUrl = (url: string, size: number) => {
  return url.replace("=s220", `=s${size}`);
};

/**
 * Get all images in my portfolio
 */
export const getPortfolio = catchAsync(async (req, res, next) => {
  const client = createClient();
  await client.connect();

  const imageIDs: string[] = JSON.parse((await client.get("portfolio"))!);
  const images: ConcertImage[] = [];
  await Promise.all(
    imageIDs.map(async (id) => {
      const image: ConcertImage = JSON.parse((await client.get(id))!);
      image.url = fixThumbnailUrl(image.url, 1280);
      images.push(image);
    })
  );

  res.status(200).send(images);
});

/**
 * Get all concerts in date order, each with a random cover image
 */
export const getConcerts = catchAsync(async (req, res, next) => {
  const client = createClient();
  await client.connect();

  const concertIDs: string[] = JSON.parse((await client.get("concerts"))!);
  const concerts: ConcertPreview[] = [];

  await Promise.all(
    concertIDs.map(async (id) => {
      const concert: ConcertDetails = JSON.parse((await client.get(id))!);
      const coverImageID =
        concert.photos[Math.floor(Math.random() * concert.photos.length)];
      const coverImage = JSON.parse((await client.get(coverImageID))!);
      coverImage.url = fixThumbnailUrl(coverImage.url, 500);
      const { photos, ...preview } = concert;
      concerts.push({ ...preview, coverImage: coverImage.url ?? null });
    })
  );

  // Sort concerts chronologically
  concerts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  res.status(200).send(concerts);
});

/**
 * Get a specific concert and its photos
 */
export const getConcert = catchAsync(async (req, res, next) => {
  const client = createClient();
  await client.connect();

  const concertID = req.params.id;
  const concert: ConcertDetails = JSON.parse((await client.get(concertID))!);

  const photoIDs = concert.photos;
  const photos: string[] = [];

  await Promise.all(
    photoIDs.map(async (id) => {
      const photo: ConcertImage = JSON.parse((await client.get(id))!);
      photo.url = fixThumbnailUrl(photo.url, 1280);
      photos.push(photo.url);
    })
  );

  concert.photos = photos;
  res.status(200).send(concert);
});

/**
 * Send an email from the contact form
 */
export const sendEmail = catchAsync(async (req, res, next) => {
  const { firstName, lastName, subject, email, message } = req.body;

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
    service: "gmail",
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
