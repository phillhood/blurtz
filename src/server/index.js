import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import newGame from './services/newGame.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // stuff
});

app.use(express.static('dist'));

io.on('connection', (socket) => {
  console.log('new connection: ', socket);
});

server.listen(process.env.PORT || 8080, () =>
  console.log(`Listening on port ${process.env.PORT || 8080}!`)
);
