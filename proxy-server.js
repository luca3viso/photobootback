const express = require('express');
const cors = require('cors');
const axios = require('axios');
const FormData = require('form-data');
const validator = require('email-validator');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const app = express();
const API_KEY = 'faa557c1-c9dc-4b36-86d7-aa1f821448e1';
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB in bytes
const DB_FILE = path.join(__dirname, 'users.json');



// Configurazione del trasportatore email
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'totemai.photoservice@gmail.com',
    pass: 'Luc@1980'
  }
});


// Modifica la funzione di generazione dell'immagine
app.post('/generate-and-send', async (req, res) => {
  try {
    // Logica di generazione dell'immagine...


    // Una volta generata l'immagine:
    const mailOptions = {
      from: 'totemai.photoservice@gmail.com',
      to: req.body.email,
      subject: 'La tua immagine generata',
      text: 'Ecco l\'immagine generata dal nostro sistema.',
      attachments: [
        {
          filename: 'generated-image.jpg',
          path: urlImmagineGenerata // URL dell'immagine generata
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





app.use(cors({
  origin: 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(express.json({ limit: '50mb' }));


app.post('/save-user', (req, res) => {
  const { name, surname, email } = req.body;
  let users = [];
  if (fs.existsSync(DB_FILE)) {
    users = JSON.parse(fs.readFileSync(DB_FILE));
  }
  users.push({ name, surname, email });
  fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
  res.json({ success: true, message: 'User data saved successfully' });
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


app.get('/view-users', (req, res) => {
  const users = JSON.parse(fs.readFileSync(DB_FILE));
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
});







const PORT = 3005;
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`)); 