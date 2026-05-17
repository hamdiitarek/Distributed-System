"use client";
// Singleton Socket.IO client. Connects directly to the peer URL
// returned by the API proxy — peers expose WebSocket on the same
// port as their HTTP server.
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;
let currentUrl = "";

export function getSocket(peerUrl: string): Socket {
  if (socket && currentUrl === peerUrl) return socket;
  if (socket) socket.disconnect();
  currentUrl = peerUrl;
  socket = io(peerUrl, { transports: ["websocket"], reconnection: true });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentUrl = "";
  }
}
