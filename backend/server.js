const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: 'http://localhost:3000' } });
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// Message Model
const messageSchema = new mongoose.Schema({
  user: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});
const Message = mongoose.model('Message', messageSchema);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// Socket.io for Real-Time Chat
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send message history
  Message.find().sort({ timestamp: 1 }).limit(50).then(messages => {
    socket.emit('messageHistory', messages);
  });

  // Handle incoming messages
  socket.on('sendMessage', async (msg) => {
    try {
      // Save user message
      const userMessage = new Message({ user: 'User', text: msg });
      await userMessage.save();
      io.emit('message', userMessage);

      // Get AI response
      const result = await model.generateContent(msg);
      const aiResponse = result.response.text();
      const aiMessage = new Message({ user: 'AI', text: aiResponse });
      await aiMessage.save();
      io.emit('message', aiMessage);
    } catch (err) {
      console.error('AI or DB error:', err);
      socket.emit('message', { user: 'AI', text: 'Sorry, something went wrong!' });
    }
  });

  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

// API Routes
app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));