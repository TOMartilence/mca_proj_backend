const dotenv = require('dotenv').config();
const cors = require('cors');
const mqtt = require('mqtt');
const mongoose = require('mongoose');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

const mongoURI = process.env.MONGO_URI || 'your_mongo_uri_here';

// MongoDB Connection
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB error:', err));

// Schema
const healthSchema = new mongoose.Schema({
  patientName: String,
  patientID: String,
  bpm: String,
  oxygen: String,
  temperature: String,
  guardianEmail: String,
  timestamp: { type: Date, default: Date.now }
});
const HealthData = mongoose.model('HealthData', healthSchema);

// Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tomj29052004@gmail.com',
    pass: process.env.MAILSENDERPASSWORD,
  }
});

// MQTT Setup
const brokerUrl = 'mqtt://broker.emqx.io:1883';
const topic = 'pshms/patientData';
const client = mqtt.connect(brokerUrl);

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  client.subscribe(topic, (err) => {
    if (err) console.error('❌ MQTT Subscribe error:', err);
    else console.log(`📡 Subscribed to topic: ${topic}`);
  });
});

client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const newData = new HealthData({
      patientName: data.patient_name,
      patientID: data.patient_id,
      bpm: data.heartrate,
      oxygen: data.oxygen,
      temperature: data.temp,
      guardianEmail: data.guardian_email,
    });

    await newData.save();
    console.log('✅ Data saved:', newData);

    // ----- Alert Thresholds -----
    const bpm = parseInt(data.heartrate);
    const oxygen = parseInt(data.oxygen);
    const temperature = parseFloat(data.temp);

    let alertMessage = '';
    if (bpm > 100) alertMessage += `🚨 High Heart Rate: ${bpm} bpm\n`;
    if (oxygen < 90) alertMessage += `🫁 Low Oxygen Level: ${oxygen}%\n`;
    if (temperature > 38.5) alertMessage += `🌡️ High Temperature: ${temperature}°C\n`;
    if (temperature < 36) alertMessage += `❄️ Low Temperature: ${temperature}°C\n`;

    if (alertMessage && data.guardian_email) {
      const mailOptions = {
        from: 'tomj29052004@gmail.com',
        to: data.guardian_email,
        subject: `⚠️ Alert for Patient ${data.patient_name} (ID: ${data.patient_id})`,
        text: `${alertMessage}\nTime: ${new Date().toLocaleString()}`
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('❌ Email sending error:', error);
        } else {
          console.log('📧 Alert email sent:', info.response);
        }
      });
    }
  } catch (error) {
    console.error('⚠️ Failed to process message:', error.message);
  }
});

// POST route to search by patient ID
app.post('/api/search', async (req, res) => {
  const { patientID } = req.body;

  if (!patientID) {
    return res.status(400).json({ error: 'patientID is required' });
  }

  try {
    const records = await HealthData.find({ patientID }).sort({ timestamp: -1 });
    res.json(records);
  } catch (error) {
    console.error('Error fetching patient data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
