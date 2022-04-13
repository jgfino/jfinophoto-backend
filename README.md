# jfinophoto.com Backend

This repo contains the backend implementation for my photography website. The server builds a photo link database in Redis by querying the Google Drive where I store my images every hour. These images are shared with a service account used by this program. The Redis database leads to fast responses that avoiding continuously querying the Drive API.

Due to the integration with Google Drive, any photos uploaded after a show will be automatically added to the "concerts" view, and any I add to the "portfolio" folder will be shown on the portfolio page.

This backend also handles contact form submission with Nodemailer and Gmail.

For frontend code, see [jfinophoto](https://github.com/jgfino/jfinophoto).
