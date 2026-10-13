'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { MongoClient } = require('mongodb');

const ROOT = __dirname;
const MAX_BODY_BYTES = 16 * 1024;
const PRIVATE_PATHS = new Set([
  '.git',
  'apps-script',
  'node_modules',
  'package-lock.json',
  'package.json',
  'server.js',
  'test'
]);
const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(JSON.stringify(payload));
}

function validateContact(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';

  if (!name || name.length > 100) {
    return { error: 'Enter a name of 1 to 100 characters.' };
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (!/^[0-9()+.\-\s]{7,32}$/.test(phone)) {
    return { error: 'Enter a valid phone number.' };
  }

  return { contact: { name, email, phone } };
}

async function readJsonBody(request) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Request body is too large.'), { status: 413 });
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body must be valid JSON.'), { status: 400 });
  }
}

async function serveContact(request, response, contactCollection) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    jsonResponse(response, 405, { error: 'Method not allowed.' });
    return;
  }

  const contentType = String(request.headers['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    jsonResponse(response, 415, { error: 'Content-Type must be application/json.' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    jsonResponse(response, error.status || 400, { error: error.message });
    return;
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    jsonResponse(response, 400, { error: 'Request body must be a JSON object.' });
    return;
  }

  if (typeof body.website === 'string' && body.website.trim()) {
    jsonResponse(response, 201, { message: 'Thanks! Your request has been sent.' });
    return;
  }

  const result = validateContact(body);
  if (result.error) {
    jsonResponse(response, 400, { error: result.error });
    return;
  }

  try {
    await contactCollection.insertOne({
      ...result.contact,
      email: result.contact.email.toLowerCase(),
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Contact request could not be saved to MongoDB.', error);
    jsonResponse(response, 500, { error: 'We couldn’t save your request. Please try again later.' });
    return;
  }

  jsonResponse(response, 201, { message: 'Thanks! Your request has been sent.' });
}

async function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    jsonResponse(response, 400, { error: 'Invalid URL path.' });
    return;
  }

  const segments = decodedPath.split('/').filter(Boolean);
  if (segments.some(segment => segment.startsWith('.') || PRIVATE_PATHS.has(segment))) {
    jsonResponse(response, 404, { error: 'Not found.' });
    return;
  }

  const requestedPath = path.resolve(ROOT, `.${decodedPath}`);
  if (requestedPath !== ROOT && !requestedPath.startsWith(`${ROOT}${path.sep}`)) {
    jsonResponse(response, 404, { error: 'Not found.' });
    return;
  }

  let filePath = requestedPath;
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    const fileStats = await fs.promises.stat(filePath);
    if (!fileStats.isFile()) {
      jsonResponse(response, 404, { error: 'Not found.' });
      return;
    }
  } catch {
    jsonResponse(response, 404, { error: 'Not found.' });
    return;
  }

  response.writeHead(200, {
    'Content-Length': (await fs.promises.stat(filePath)).size,
    'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff'
  });

  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  fs.createReadStream(filePath).pipe(response);
}

function createServer(contactCollection) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');

    if (url.pathname === '/api/contact') {
      serveContact(request, response, contactCollection)
        .catch(error => {
          console.error('Contact API request failed unexpectedly.', error);
          if (!response.headersSent) {
            jsonResponse(response, 500, { error: 'We couldn’t save your request. Please try again later.' });
          }
        });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      jsonResponse(response, 405, { error: 'Method not allowed.' });
      return;
    }

    serveStatic(request, response, url.pathname)
      .catch(error => {
        console.error('Static file request failed unexpectedly.', error);
        if (!response.headersSent) {
          jsonResponse(response, 500, { error: 'Unable to serve this page.' });
        }
      });
  });
}

async function start() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI must be configured before starting the server.');
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const database = client.db(process.env.MONGODB_DATABASE || 'westforce');
  const server = createServer(database.collection('contactRequests'));
  const port = Number(process.env.PORT) || 3000;

  server.listen(port, () => {
    console.log(`WestForceKit is listening on port ${port}.`);
  });

  const close = async () => {
    server.close();
    await client.close();
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

if (require.main === module) {
  start().catch(error => {
    console.error('WestForceKit server could not start.', error);
    process.exitCode = 1;
  });
}

module.exports = { createServer, validateContact };
