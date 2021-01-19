const express = require('express');
const socketIO = require('socket.io');

const app = express();

app.use(express.static('dist'));

const server = app.listen(process.env.PORT || 8080, () =>
  console.log(`Listening on port ${process.env.PORT || 8080}!`)
);

const io = socketIO.listen(server);

io.on('connection', (socket) => {
  socket.on('event', (message) => {
    socket.broadcast.emit('event', message);
  });
});
