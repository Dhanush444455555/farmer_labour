import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`;

export const socket = io(API_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export const joinUserRoom = (uid) => {
  if (uid && socket.connected) {
    socket.emit('join-room', String(uid));
  } else if (uid) {
    socket.once('connect', () => {
      socket.emit('join-room', String(uid));
    });
  }
};
