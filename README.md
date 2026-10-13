# WestForceKit

WestForceKit is an installable Progressive Web App (PWA). It keeps the
existing WestForce portfolio site and adds app-style mobile navigation,
an install prompt where supported, and an offline-cached app shell.

## Run locally

Configure MongoDB as described below, then run `npm install` and `npm start`.
Open `http://localhost:3000` in a supported browser. The built-in server serves
the site and contact API from the same origin. Use the browser's install
option, or the **Install app** button when the browser offers it. On iOS, use
Safari's **Share → Add to Home Screen**.

The page shell is cached for offline viewing after the first successful load.
External links, fonts, and documents that have not already been downloaded may
still require an internet connection.

## Save contact requests to MongoDB

The contact form submits to the Node.js API in `server.js`. The API validates
the submitted name, email, and phone number and saves them in the
`contactRequests` collection. The MongoDB connection string stays on the
server and is never included in the browser code.

1. Create a MongoDB database and a database user with permission to write to
   the database.
2. Copy `.env.example` to `.env` and set `MONGODB_URI` to the connection string
   from your MongoDB deployment. Set `MONGODB_DATABASE` to the database name
   you want to use.
3. Install dependencies with `npm install`, then run the site and API with
   `npm start`. The server listens on port `3000` by default; set `PORT` if
   needed.
4. Deploy this Node.js server on a host that supports persistent Node.js
   processes and set `MONGODB_URI` and `MONGODB_DATABASE` as server-side
   environment variables. Serve the site and `/api/contact` from the same
   origin, or configure a same-origin reverse proxy to the API.

Do not commit `.env` or expose the MongoDB URI in client-side code. Limit the
database user's permissions to the database and operations the application
needs.