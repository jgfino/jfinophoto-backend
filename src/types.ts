interface ConcertBase {
  date: string;
  venue: string;
  id: string;
  artist: string;
}

export interface ConcertPreview extends ConcertBase {
  coverImage: string;
}

export interface ConcertDetails extends ConcertBase {
  photos: string[];
}

export interface ConcertImage extends ConcertBase {
  url: string;
}

export interface ContactForm {
  email: string;
  subject: string;
  firstName: string;
  lastName: string;
  message: string;
}
