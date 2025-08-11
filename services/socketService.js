// services/socketService.js
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/user");
const logme = require("../utils/logger");

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.ticketRooms = new Map(); // ticketId -> Set of socketIds
  }

  initialize(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
        
        if (!token) {
          return next(new Error("Authentication error"));
        }

        // Remove 'Bearer ' prefix if present
        const cleanToken = token.replace("Bearer ", "");
        
        const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select("_id userType rtoId");
        
        if (!user) {
          return next(new Error("User not found"));
        }

        socket.userId = user._id.toString();
        socket.userType = user.userType;
        socket.rtoId = user.rtoId?.toString();
        
        next();
      } catch (error) {
        logme.error("Socket authentication error:", error);
        next(new Error("Authentication error"));
      }
    });

    this.io.on("connection", (socket) => {
      this.handleConnection(socket);
    });

    logme.info("Socket.IO service initialized");
  }

  handleConnection(socket) {
    const userId = socket.userId;
    const userType = socket.userType;
    const rtoId = socket.rtoId;

    // Store user connection
    this.connectedUsers.set(userId, socket.id);
    
    logme.info("User connected to socket", {
      userId,
      userType,
      rtoId,
      socketId: socket.id,
    });

    // Join RTO-specific room for broadcast messages
    if (rtoId) {
      socket.join(`rto_${rtoId}`);
    }

    // Handle joining ticket rooms
    socket.on("join_ticket", (ticketId) => {
      this.joinTicketRoom(socket, ticketId);
    });

    // Handle leaving ticket rooms
    socket.on("leave_ticket", (ticketId) => {
      this.leaveTicketRoom(socket, ticketId);
    });

    // Handle typing indicators
    socket.on("typing_start", (data) => {
      this.handleTypingStart(socket, data);
    });

    socket.on("typing_stop", (data) => {
      this.handleTypingStop(socket, data);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
      this.handleDisconnection(socket);
    });
  }

  joinTicketRoom(socket, ticketId) {
    const roomName = `ticket_${ticketId}`;
    socket.join(roomName);
    
    // Track room membership
    if (!this.ticketRooms.has(ticketId)) {
      this.ticketRooms.set(ticketId, new Set());
    }
    this.ticketRooms.get(ticketId).add(socket.id);

    logme.info("User joined ticket room", {
      userId: socket.userId,
      ticketId,
      socketId: socket.id,
    });
  }

  leaveTicketRoom(socket, ticketId) {
    const roomName = `ticket_${ticketId}`;
    socket.leave(roomName);
    
    // Remove from tracking
    if (this.ticketRooms.has(ticketId)) {
      this.ticketRooms.get(ticketId).delete(socket.id);
      if (this.ticketRooms.get(ticketId).size === 0) {
        this.ticketRooms.delete(ticketId);
      }
    }

    logme.info("User left ticket room", {
      userId: socket.userId,
      ticketId,
      socketId: socket.id,
    });
  }

  handleTypingStart(socket, data) {
    const { ticketId } = data;
    const roomName = `ticket_${ticketId}`;
    
    socket.to(roomName).emit("user_typing", {
      ticketId,
      userId: socket.userId,
      userType: socket.userType,
    });
  }

  handleTypingStop(socket, data) {
    const { ticketId } = data;
    const roomName = `ticket_${ticketId}`;
    
    socket.to(roomName).emit("user_stopped_typing", {
      ticketId,
      userId: socket.userId,
      userType: socket.userType,
    });
  }

  handleDisconnection(socket) {
    const userId = socket.userId;
    
    // Remove from connected users
    this.connectedUsers.delete(userId);
    
    // Remove from all ticket rooms
    for (const [ticketId, socketIds] of this.ticketRooms.entries()) {
      if (socketIds.has(socket.id)) {
        socketIds.delete(socket.id);
        if (socketIds.size === 0) {
          this.ticketRooms.delete(ticketId);
        }
      }
    }

    logme.info("User disconnected from socket", {
      userId,
      socketId: socket.id,
    });
  }

  // Emit new message to all users in a ticket room
  emitNewMessage(ticketId, message) {
    const roomName = `ticket_${ticketId}`;
    
    this.io.to(roomName).emit("new_message", {
      ticketId,
      message,
    });

    logme.info("New message emitted", {
      ticketId,
      messageId: message._id,
      roomName,
    });
  }

  // Emit message update (for edited messages)
  emitMessageUpdate(ticketId, message) {
    const roomName = `ticket_${ticketId}`;
    
    this.io.to(roomName).emit("message_updated", {
      ticketId,
      message,
    });

    logme.info("Message update emitted", {
      ticketId,
      messageId: message._id,
      roomName,
    });
  }

  // Emit message deletion
  emitMessageDeleted(ticketId, messageId) {
    const roomName = `ticket_${ticketId}`;
    
    this.io.to(roomName).emit("message_deleted", {
      ticketId,
      messageId,
    });

    logme.info("Message deletion emitted", {
      ticketId,
      messageId,
      roomName,
    });
  }

  // Emit ticket status update
  emitTicketStatusUpdate(ticketId, ticket) {
    const roomName = `ticket_${ticketId}`;
    
    this.io.to(roomName).emit("ticket_status_updated", {
      ticketId,
      ticket,
    });

    logme.info("Ticket status update emitted", {
      ticketId,
      status: ticket.status,
      roomName,
    });
  }

  // Emit ticket assignment update
  emitTicketAssignmentUpdate(ticketId, ticket) {
    const roomName = `ticket_${ticketId}`;
    
    this.io.to(roomName).emit("ticket_assignment_updated", {
      ticketId,
      ticket,
    });

    logme.info("Ticket assignment update emitted", {
      ticketId,
      assignedTo: ticket.assignedTo,
      roomName,
    });
  }

  // Get connected users for a ticket
  getConnectedUsersForTicket(ticketId) {
    const roomName = `ticket_${ticketId}`;
    const room = this.io.sockets.adapter.rooms.get(roomName);
    return room ? Array.from(room) : [];
  }

  // Check if user is connected
  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  // Send notification to specific user
  sendNotificationToUser(userId, notification) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit("notification", notification);
    }
  }

  // Broadcast to RTO
  broadcastToRTO(rtoId, event, data) {
    const roomName = `rto_${rtoId}`;
    this.io.to(roomName).emit(event, data);
  }
}

module.exports = new SocketService(); 