export interface Concert {
  date: string;
  venue: string;
  id: string;
  artist: string;
  artistId?: string;
}

export interface ConcertWithPhotos extends Concert {
  photos: ConcertImage[];
}

export interface ConcertImage extends Concert {
  url: string;
}

export interface ContactForm {
  email: string;
  subject: string;
  firstName: string;
  lastName: string;
  message: string;
}
