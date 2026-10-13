'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createServer, validateContact } = require('../server');

const insertedContacts = [];
const server = createServer({
  async insertOne(document) {
    insertedContacts.push(document);
  }
});
let baseUrl;

before(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

test('validates required contact details', () => {
  assert.deepEqual(validateContact({
    name: '  Sam Example ',
    email: ' SAM@example.com ',
    phone: '416-555-0123'
  }), {
    contact: {
      name: 'Sam Example',
      email: 'SAM@example.com',
      phone: '416-555-0123'
    }
  });
  assert.match(validateContact({ name: '', email: 'invalid', phone: '123' }).error, /name/);
});

test('stores a valid contact request in MongoDB', async () => {
  insertedContacts.length = 0;
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Sam Example',
      email: 'SAM@example.com',
      phone: '416-555-0123'
    })
  });

  assert.equal(response.status, 201);
  assert.equal(insertedContacts.length, 1);
  assert.equal(insertedContacts[0].email, 'sam@example.com');
  assert.ok(insertedContacts[0].createdAt instanceof Date);
});

test('rejects invalid contact details without inserting them', async () => {
  insertedContacts.length = 0;
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sam', email: 'invalid', phone: '123' })
  });

  assert.equal(response.status, 400);
  assert.equal(insertedContacts.length, 0);
});

test('accepts the honeypot without storing contact data', async () => {
  insertedContacts.length = 0;
  const response = await fetch(`${baseUrl}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ website: 'bot-filled-this' })
  });

  assert.equal(response.status, 201);
  assert.equal(insertedContacts.length, 0);
});
