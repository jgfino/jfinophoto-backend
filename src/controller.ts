import { catchAsync } from "./error/catchAsync";
import { createClient } from "redis";

/**
 * Get all images in my portfolio
 */
export const getPortfolio = catchAsync(async (req, res, next) => {
  const client = createClient();
  await client.connect();

  const imageIDs: string[] = JSON.parse(await client.get("portfolio"));
  const images = [];
  await Promise.all(
    imageIDs.map(async (id) => {
      const image = JSON.parse(await client.get(id));
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

  const concertIDs: string[] = JSON.parse(await client.get("concerts"));
  const concerts = [];

  await Promise.all(
    concertIDs.map(async (id) => {
      const concert = JSON.parse(await client.get(id));
      const coverImageID =
        concert.photos[Math.floor(Math.random() * concert.photos.length)];
      const coverImage = JSON.parse(await client.get(coverImageID));
      delete concert.photos;
      concerts.push({ ...concert, coverImage: coverImage.url ?? null });
    })
  );

  concerts.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
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
  const concert = JSON.parse(await client.get(concertID));

  const photoIDs = concert.photos;
  const photos: string[] = [];

  await Promise.all(
    photoIDs.map(async (id) => {
      const photo = JSON.parse(await client.get(id));
      photos.push(photo.url);
    })
  );

  concert.photos = photos;
  res.status(200).send(concert);
});
