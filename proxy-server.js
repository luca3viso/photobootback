const express = require('express');
const app = express();
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const validator = require('email-validator');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const nodemailer = require('nodemailer');

console.log('Server starting...');

const API_KEY = process.env.API_KEY || 'faa557c1-c9dc-4b36-86d7-aa1f821448e1';
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
const DB_FILE = path.join('/tmp', 'users.json');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'totemai.photoservice@gmail.com',
    pass: process.env.EMAIL_PASS || 'Luc@1980'
  }
});

app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://photobooth-chi.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.send('Photobooth backend server is running!');
});

app.post('/generate-and-send', async (req, res) => {
  try {
    const urlImmagineGenerata = 'URL_DELL_IMMAGINE_GENERATA';
    const mailOptions = {
      from: process.env.EMAIL_USER || 'totemai.photoservice@gmail.com',
      to: req.body.email,
      subject: 'La tua immagine generata',
      text: 'Ecco l\'immagine generata dal nostro sistema.',
      attachments: [
        {
          filename: 'generated-image.jpg',
          path: urlImmagineGenerata
        }
      ]
    };
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Immagine generata e inviata via email' });
  } catch (error) {
    console.error('Errore:', error);
    res.status(500).json({ error: 'Errore durante la generazione o l\'invio dell\'immagine' });
  }
});

app.post('/save-user', async (req, res) => {
  try {
    const { name, surname, email } = req.body;
    let users = [];
    try {
      const data = await fs.readFile(DB_FILE, 'utf8');
      users = JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is empty, start with an empty array
    }
    users.push({ name, surname, email });
    await fs.writeFile(DB_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true, message: 'User data saved successfully' });
  } catch (error) {
    console.error('Error saving user:', error);
    res.status(500).json({ error: 'Error saving user data' });
  }
});

app.post('/upload-image', async (req, res) => {
  console.log('Richiesta di upload ricevuta');
  try {
    const imageData = req.body.imageData;
    const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');
    if (imageBuffer.length > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: 'Image size exceeds 50MB limit' });
    }
    console.log('Image size:', imageBuffer.length, 'bytes');
    const presignedUrlResponse = await axios.post('https://cloud.leonardo.ai/api/rest/v1/init-image',
      { extension: 'jpg' },
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );
    console.log('Presigned URL response:', JSON.stringify(presignedUrlResponse.data, null, 2));
    const { url, fields, id: imageId } = presignedUrlResponse.data.uploadInitImage;
    const formData = new FormData();
    const parsedFields = JSON.parse(fields);
    Object.entries(parsedFields).forEach(([key, value]) => {
      formData.append(key, value);
    });
    formData.append('file', imageBuffer, {
      filename: 'image.jpg',
      contentType: 'image/jpeg',
    });
    const s3UploadResponse = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
        'Content-Length': formData.getLengthSync()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    console.log('S3 upload response status:', s3UploadResponse.status);
    console.log('Upload su S3 completato con successo');
    res.json({ imageId: imageId });
  } catch (error) {
    console.log('Detailed error in image upload:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error uploading image', details: error.response?.data || error.message });
  }
});

app.post('/validate-email', (req, res) => {
  const { email } = req.body;
  const isValid = validator.validate(email);
  res.json({ valid: isValid, message: isValid ? 'Email is valid' : 'Email is not valid' });
});


app.get('/view-users', async (req, res) => {
  try {
    const response = await axios.get('https://photobooth-chi.vercel.app/src/users.json');
    const users = response.data;
    const uniqueUsers = Array.from(new Set(users.map(u => u.email)))
      .map(email => users.find(u => u.email === email));
    
    const html = `
      <!DOCTYPE html>
      <html lang="it">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Utenti Registrati</title>
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-100">
        <div class="container mx-auto px-4 py-8">
          <h1 class="text-3xl font-bold mb-6">Utenti Registrati</h1>
          <table class="w-full bg-white shadow-md rounded-lg overflow-hidden">
            <thead class="bg-gray-200 text-gray-700">
              <tr>
                <th class="py-3 px-4 text-left">Nome</th>
                <th class="py-3 px-4 text-left">Cognome</th>
                <th class="py-3 px-4 text-left">Email</th>
              </tr>
            </thead>
            <tbody>
              ${uniqueUsers.map(user => `
                <tr class="border-b border-gray-200 hover:bg-gray-100">
                  <td class="py-3 px-4">${user.name}</td>
                  <td class="py-3 px-4">${user.surname}</td>
                  <td class="py-3 px-4">${user.email}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </body>
      </html>
    `;
    res.send(html);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).send('Error fetching user data');
  }
});


module.exports = app;
