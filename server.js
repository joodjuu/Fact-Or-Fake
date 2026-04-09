const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

const MAX_PLAYERS = 6;
const BOARD_SIZE = 100;

const ladders = {
  4: 14,
  9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91
};

const snakes = {
  17: 7,
  54: 34,
  62: 19,
  64: 60,
  87: 24,
  93: 73,
  95: 75,
  99: 78
};

const quizTiles = [6, 13, 22, 27, 35, 44, 48, 57, 69, 76, 83, 97];

const questions = [
  {
    id: 1,
    text: "ทุกสิ่งที่เห็นในโซเชียลมีเดียสะท้อนชีวิตจริงทั้งหมด",
    answer: false,
    explanation: "ไม่จริง เพราะหลายโพสต์เป็นภาพที่คัดเลือกและตกแต่งมาแล้ว ไม่ได้สะท้อนชีวิตจริงทั้งหมด"
  },
  {
    id: 2,
    text: "การเปรียบเทียบตัวเองกับคนอื่นในโซเชียลมากเกินไปอาจทำให้เครียดได้",
    answer: true,
    explanation: "จริง เพราะการเปรียบเทียบบ่อย ๆ อาจทำให้รู้สึกกดดัน ไม่มั่นใจ หรือคิดว่าตัวเองด้อยกว่า"
  },
  {
    id: 3,
    text: "ถ้าคนอื่นประสบความสำเร็จเร็ว แปลว่าเราล้มเหลว",
    answer: false,
    explanation: "ไม่จริง เพราะแต่ละคนมีจังหวะชีวิตและเส้นทางของตัวเอง ความสำเร็จไม่ได้มีเวลาเดียวกัน"
  },
  {
    id: 4,
    text: "การพักจากโซเชียลมีเดียเป็นระยะ ๆ อาจช่วยลดความกดดันได้",
    answer: true,
    explanation: "จริง เพราะช่วยลดการรับข้อมูลเปรียบเทียบตลอดเวลา และทำให้เรากลับมาโฟกัสชีวิตตัวเองมากขึ้น"
  },
  {
    id: 5,
    text: "ยอดไลก์สูงหมายความว่าคนนั้นมีความสุขมากกว่าคนอื่นเสมอ",
    answer: false,
    explanation: "ไม่จริง เพราะยอดไลก์ไม่ได้วัดความสุขจริงของคน ๆ นั้น"
  },
  {
    id: 6,
    text: "คอนเทนต์ที่ดูสมบูรณ์แบบอาจผ่านการคัดเลือก มุมกล้อง หรือการตัดต่อมาแล้ว",
    answer: true,
    explanation: "จริง เพราะคอนเทนต์ออนไลน์จำนวนมากผ่านการจัดฉากหรือเลือกเฉพาะส่วนที่อยากให้เห็น"
  },
  {
    id: 7,
    text: "ทุกคนควรต้องประสบความสำเร็จตั้งแต่อายุน้อยเหมือนกัน",
    answer: false,
    explanation: "ไม่จริง เพราะมาตรฐานความสำเร็จของแต่ละคนต่างกัน และเวลาไปถึงเป้าหมายก็ไม่เหมือนกัน"
  },
  {
    id: 8,
    text: "การรู้เท่าทันสื่อช่วยให้เรามองโซเชียลมีเดียอย่างสมดุลมากขึ้น",
    answer: true,
    explanation: "จริง เพราะช่วยให้แยกได้ว่าอะไรคือการนำเสนอ อะไรคือความจริง และไม่หลงเชื่อภาพลวงง่ายเกินไป"
  }
];

function createRoom(roomCode) {
  return {
    code: roomCode,
    players: [],
    turnIndex: 0,
    started: false,
    winner: null,
    diceRolling: false,
    pendingQuiz: null,
    lastAction: "Waiting for players",
    createdAt: Date.now()
  };
}

const rooms = new Map();
const socketToPlayer = new Map();

function sanitizeName(name = "") {
  return String(name).trim().slice(0, 20) || "Player";
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function randomQuestion() {
  return questions[Math.floor(Math.random() * questions.length)];
}

function getPublicRoomState(room) {
  return {
    code: room.code,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      token: p.token,
      position: p.position,
      connected: p.connected
    })),
    turnIndex: room.turnIndex,
    started: room.started,
    winner: room.winner,
    diceRolling: room.diceRolling,
    pendingQuiz: room.pendingQuiz
      ? {
          playerId: room.pendingQuiz.playerId,
          tile: room.pendingQuiz.tile,
          question: {
            id: room.pendingQuiz.question.id,
            text: room.pendingQuiz.question.text
          }
        }
      : null,
    lastAction: room.lastAction,
    ladders,
    snakes,
    quizTiles,
    boardSize: BOARD_SIZE,
    maxPlayers: MAX_PLAYERS
  };
}

function broadcastRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  io.to(roomCode).emit("room:update", getPublicRoomState(room));
}

function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId);
}

function moveBy(room, player, delta, reason) {
  let next = player.position + delta;
  if (next < 1) next = 1;
  if (next > BOARD_SIZE) next = BOARD_SIZE;
  player.position = next;
  room.lastAction = `${player.name} ${reason} ไปที่ช่อง ${player.position}`;

  if (player.position === BOARD_SIZE) {
    room.winner = player.id;
    room.lastAction = `🎉 ${player.name} ชนะแล้ว!`;
  }
}

function advanceTurn(room) {
  if (room.winner) return;
  if (room.players.length === 0) return;

  let attempts = 0;
  do {
    room.turnIndex = (room.turnIndex + 1) % room.players.length;
    attempts++;
  } while (!room.players[room.turnIndex]?.connected && attempts <= room.players.length);

  const current = room.players[room.turnIndex];
  if (current) {
    room.lastAction = `ถึงตา ${current.name}`;
  }
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ name }) => {
    const roomCode = generateRoomCode();
    const room = createRoom(roomCode);

    const player = {
      id: socket.id,
      socketId: socket.id,
      name: sanitizeName(name),
      token: 0,
      position: 1,
      connected: true
    };

    room.players.push(player);
    socketToPlayer.set(socket.id, { roomCode, playerId: player.id });
    rooms.set(roomCode, room);
    socket.join(roomCode);

    socket.emit("room:joined", {
      roomCode,
      playerId: player.id
    });

    broadcastRoom(roomCode);
  });

  socket.on("room:join", ({ roomCode, name }) => {
    const room = rooms.get(String(roomCode).toUpperCase());
    if (!room) {
      socket.emit("room:error", "ไม่พบห้องนี้");
      return;
    }
    if (room.started) {
      socket.emit("room:error", "เกมเริ่มแล้ว เข้าร่วมเพิ่มไม่ได้");
      return;
    }
    if (room.players.length >= MAX_PLAYERS) {
      socket.emit("room:error", "ห้องเต็มแล้ว");
      return;
    }

    const player = {
      id: socket.id,
      socketId: socket.id,
      name: sanitizeName(name),
      token: room.players.length,
      position: 1,
      connected: true
    };

    room.players.push(player);
    socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });
    socket.join(room.code);

    socket.emit("room:joined", {
      roomCode: room.code,
      playerId: player.id
    });

    room.lastAction = `${player.name} เข้าร่วมห้องแล้ว`;
    broadcastRoom(room.code);
  });

  socket.on("room:rejoin", ({ roomCode, playerId }) => {
    const room = rooms.get(String(roomCode).toUpperCase());
    if (!room) {
      socket.emit("room:error", "ไม่พบห้องสำหรับ reconnect");
      return;
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      socket.emit("room:error", "ไม่พบผู้เล่นเดิมในห้องนี้");
      return;
    }

    player.socketId = socket.id;
    player.connected = true;
    socketToPlayer.set(socket.id, { roomCode: room.code, playerId: player.id });
    socket.join(room.code);

    socket.emit("room:joined", {
      roomCode: room.code,
      playerId: player.id
    });

    room.lastAction = `${player.name} กลับเข้าสู่เกม`;
    broadcastRoom(room.code);
  });

  socket.on("game:start", ({ roomCode, playerId }) => {
    const room = rooms.get(String(roomCode).toUpperCase());
    if (!room) return;
    const owner = room.players[0];
    if (!owner || owner.id !== playerId) return;
    if (room.players.length < 2) {
      socket.emit("room:error", "ต้องมีอย่างน้อย 2 คนถึงจะเริ่มเกมได้");
      return;
    }

    room.started = true;
    room.turnIndex = 0;
    room.lastAction = `เกมเริ่มแล้ว! ถึงตา ${room.players[0].name}`;
    broadcastRoom(room.code);
  });

  socket.on("game:rollDice", ({ roomCode, playerId }) => {
    const room = rooms.get(String(roomCode).toUpperCase());
    if (!room || !room.started || room.winner || room.pendingQuiz) return;

    const current = room.players[room.turnIndex];
    if (!current || current.id !== playerId) return;
    if (room.diceRolling) return;

    room.diceRolling = true;
    const roll = Math.floor(Math.random() * 6) + 1;
    current.position += roll;
    if (current.position > BOARD_SIZE) current.position = BOARD_SIZE;

    room.lastAction = `🎲 ${current.name} ทอยได้ ${roll} เดินไปช่อง ${current.position}`;

    if (current.position === BOARD_SIZE) {
      room.winner = current.id;
      room.diceRolling = false;
      room.lastAction = `🎉 ${current.name} ชนะแล้ว!`;
      broadcastRoom(room.code);
      return;
    }

    if (ladders[current.position]) {
      const from = current.position;
      current.position = ladders[current.position];
      room.lastAction = `🪜 ${current.name} ขึ้นบันไดจาก ${from} ไป ${current.position}`;
    } else if (snakes[current.position]) {
      const from = current.position;
      current.position = snakes[current.position];
      room.lastAction = `🐍 ${current.name} โดนงูจาก ${from} ลงไป ${current.position}`;
    }

    if (current.position === BOARD_SIZE) {
      room.winner = current.id;
      room.diceRolling = false;
      room.lastAction = `🎉 ${current.name} ชนะแล้ว!`;
      broadcastRoom(room.code);
      return;
    }

    if (quizTiles.includes(current.position)) {
      room.pendingQuiz = {
        playerId: current.id,
        tile: current.position,
        question: randomQuestion()
      };
      room.lastAction = `❓ ${current.name} ตกช่องคำถามที่ช่อง ${current.position}`;
      room.diceRolling = false;
      broadcastRoom(room.code);
      return;
    }

    room.diceRolling = false;
    advanceTurn(room);
    broadcastRoom(room.code);
  });

  socket.on("quiz:answer", ({ roomCode, playerId, answer }) => {
    const room = rooms.get(String(roomCode).toUpperCase());
    if (!room || !room.pendingQuiz || room.winner) return;
    if (room.pendingQuiz.playerId !== playerId) return;

    const player = findPlayer(room, playerId);
    if (!player) return;

    const isCorrect = Boolean(answer) === room.pendingQuiz.question.answer;
    const explanation = room.pendingQuiz.question.explanation;

    if (isCorrect) {
      moveBy(room, player, 1, "ตอบถูก เดินหน้า 1 ช่อง");
    } else {
      moveBy(room, player, -1, "ตอบผิด ถอยหลัง 1 ช่อง");
    }

    const payload = {
      isCorrect,
      correctAnswer: room.pendingQuiz.question.answer,
      explanation,
      playerId
    };

    room.pendingQuiz = null;

    if (!room.winner) {
      advanceTurn(room);
    }

    broadcastRoom(room.code);
    io.to(room.code).emit("quiz:result", payload);
  });

  socket.on("disconnect", () => {
    const meta = socketToPlayer.get(socket.id);
    if (!meta) return;

    const room = rooms.get(meta.roomCode);
    if (!room) return;

    const player = room.players.find((p) => p.id === meta.playerId);
    if (player) {
      player.connected = false;
      room.lastAction = `${player.name} หลุดการเชื่อมต่อ`;
    }

    socketToPlayer.delete(socket.id);
    broadcastRoom(room.code);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});