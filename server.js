const dotenv = require('dotenv').config();
const cors = require('cors');
const mqtt = require('mqtt');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const mongoURI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

// Hardcoded valid email-password pairs for testing
const validUsers = [
  { email: 'hospital1@example.com', password: 'password1' },
  { email: 'hospital2@example.com', password: 'password2' },
  { email: 'hospital3@example.com', password: 'password3' },
];

// Connect to MongoDB
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB Atlas');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Updated Health data schema with patientName and patientID
const healthSchema = new mongoose.Schema({
  patientName: { type: String, required: true },
  patientID: { type: String, required: true },
  bpm: String,
  oxygen: String,
  temperature: String,
  timestamp: { type: Date, default: Date.now }
});
const HealthData = mongoose.model('HealthData', healthSchema);

// MQTT Setup
const brokerUrl = 'mqtt://broker.emqx.io:1883';
const topic = 'patient/healthDataOneTwoThreeTesting';

const client = mqtt.connect(brokerUrl);

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe(topic, (err) => {
    if (!err) {
      console.log(`Subscribed to topic: ${topic}`);
    } else {
      console.error('Subscription error:', err);
    }
  });
});

// Handle incoming MQTT messages and save to MongoDB
client.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    console.log('Received message:', data);

    // Validate required fields
    if (!data.patientName || !data.patientID) {
      throw new Error('Patient name and ID are required');
    }

    const newData = new HealthData(data);
    await newData.save();
    console.log('Data saved to MongoDB');
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// API route to fetch data from MongoDB
app.get('/api/data', async (req, res) => {
  try {
    const allData = await HealthData.find().sort({ timestamp: -1 }); // latest first
    res.json(allData);
  } catch (error) {
    console.error('Error fetching data from MongoDB:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// API route for login with JWT generation
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  const user = validUsers.find(u => u.email === email && u.password === password);

  if (user) {
    // Token expires in 1 minute (60 seconds)
    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '60s' });
    res.json({ token });
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});