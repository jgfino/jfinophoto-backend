import { catchAsync } from "./error/catchAsync";
import { createClient } from "redis";
import nodemailer from "nodemailer";
import { ConcertDetails, ConcertImage, ConcertPreview } from "./types";
import { RedisDetails } from "./api/googleDrive";

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
export const getPortfolio = catchAsync(async (_, res) => {
  const client = createClient();
  await client.connect();

  const imageIDs: string[] = JSON.parse((await client.get("portfolio"))!);
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

  res.status(200).send(images);
});

/**
 * Get all concerts in date order, each with a random cover image
 */
export const getConcerts = catchAsync(async (_, res) => {
  const client = createClient();
  await client.connect();

  const concertIDs: string[] = JSON.parse((await client.get("concerts"))!);
  const concerts: ConcertPreview[] = [];

  await Promise.all(
    concertIDs.map(async (id) => {
      const concert: RedisDetails = JSON.parse((await client.get(id))!);
      const coverImageStored =
        concert.photos[Math.floor(Math.random() * concert.photos.length)];
      const coverImage = JSON.parse((await client.get(coverImageStored))!);
      coverImage.url = fixThumbnailUrl(coverImage.url, 500);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
export const getConcert = catchAsync(async (req, res) => {
  const client = createClient();
  await client.connect();

  const concertID = req.params.id;
  const concert: RedisDetails = JSON.parse((await client.get(concertID))!);

  const photoIDs = concert.photos;
  const photos: ConcertImage[] = [];

  await Promise.all(
    photoIDs.map(async (img) => {
      const photo: ConcertImage = JSON.parse((await client.get(img))!);
      photo.url = fixThumbnailUrl(photo.url, 1600);
      photos.push(photo);
    })
  );

  const concertDetails: ConcertDetails = {
    ...concert,
    photos,
  };

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
