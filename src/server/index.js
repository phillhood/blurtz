import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import newGame from './services/newGame.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

app.use(express.static('dist'));

io.on('connection', (socket) => {
  console.log('new connection: ', socket.sockets);
});

server.listen(process.env.PORT || 8080, () =>
  console.log(`Listening on port ${process.env.PORT || 8080}!`)
);
