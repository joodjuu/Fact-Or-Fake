const socket = io();

const colors = ["#ff7eb6", "#8d86ff", "#4dc9b0", "#ffb347", "#6cb5ff", "#ff8f8f"];
const animalTokens = ["🐰", "🐻", "🐥", "🐱", "🦊", "🐼"];

const lobbyView = document.getElementById("lobbyView");
const gameView = document.getElementById("gameView");
const playerNameInput = document.getElementById("playerName");
const roomCodeInput = document.getElementById("roomCodeInput");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const startGameBtn = document.getElementById("startGameBtn");
const rollDiceBtn = document.getElementById("rollDiceBtn");
const roomInfo = document.getElementById("roomInfo");
const playersList = document.getElementById("playersList");
const board = document.getElementById("board");
const statusText = document.getElementById("statusText");
const diceDisplay = document.getElementById("diceDisplay");
const quizModal = document.getElementById("quizModal");
const quizQuestion = document.getElementById("quizQuestion");
const trueBtn = document.getElementById("trueBtn");
const falseBtn = document.getElementById("falseBtn");
const resultModal = document.getElementById("resultModal");
const resultTitle = document.getElementById("resultTitle");
const resultExplanation = document.getElementById("resultExplanation");
const closeResultBtn = document.getElementById("closeResultBtn");
const winnerModal = document.getElementById("winnerModal");
const winnerTitle = document.getElementById("winnerTitle");
const winnerText = document.getElementById("winnerText");
const closeWinnerBtn = document.getElementById("closeWinnerBtn");
const restartBtn = document.getElementById("restartBtn");
const exitBtn = document.getElementById("exitBtn");

let state = null;
let myPlayerId = localStorage.getItem("snake_player_id") || null;
let myRoomCode = localStorage.getItem("snake_room_code") || null;
let pendingResultForMe = false;

function getName() {
  return (playerNameInput.value || localStorage.getItem("snake_name") || "Player").trim();
}

function saveIdentity(name, roomCode, playerId) {
  localStorage.setItem("snake_name", name);
  localStorage.setItem("snake_room_code", roomCode);
  localStorage.setItem("snake_player_id", playerId);
  myRoomCode = roomCode;
  myPlayerId = playerId;
}

function maybeReconnect() {
  const name = localStorage.getItem("snake_name");
  if (name) playerNameInput.value = name;
  if (myRoomCode && myPlayerId) {
    socket.emit("room:rejoin", { roomCode: myRoomCode, playerId: myPlayerId });
  }
}

function tileNumberToGridOrder(n) {
  const row = Math.floor((n - 1) / 10);
  const col = (n - 1) % 10;
  if (row % 2 === 0) return row * 10 + col + 1;
  return row * 10 + (9 - col) + 1;
}

function buildBoard() {
  board.innerHTML = "";
  const tileMap = new Map();

  for (let visualIndex = 100; visualIndex >= 1; visualIndex--) {
    const realNum = tileNumberToGridOrder(visualIndex);
    const div = document.createElement("div");
    div.className = "tile";
    div.dataset.tile = realNum;

    const num = document.createElement("div");
    num.className = "tile-number";
    num.textContent = realNum;

    const icon = document.createElement("div");
    icon.className = "tile-icon";

    div.appendChild(num);

    const tokenWrap = document.createElement("div");
    tokenWrap.className = "tokens";
    div.appendChild(tokenWrap);

    if (state?.ladders?.[realNum]) {
      icon.textContent = "🪜";
      div.appendChild(icon);
    } else if (state?.snakes?.[realNum]) {
      icon.textContent = "🐍";
      div.appendChild(icon);
    } else if (state?.quizTiles?.includes(realNum)) {
      div.classList.add("quiz");
    }

    board.appendChild(div);
    tileMap.set(realNum, tokenWrap);
  }

  if (state?.players) {
    state.players.forEach((player) => {
      const wrap = tileMap.get(player.position);
      if (!wrap) return;
      const token = document.createElement("div");
      token.className = "token";
      token.style.background = colors[player.token % colors.length];
      token.title = player.name;
      token.textContent = String(player.name || "P").charAt(0).toUpperCase();
      wrap.appendChild(token);
    });
  }
}

function renderPlayers() {
  playersList.innerHTML = "";
  if (!state?.players) return;

  state.players.forEach((player, idx) => {
    const isCurrent = state.turnIndex === idx && state.started && !state.winner;
    const isMe = player.id === myPlayerId;

    const div = document.createElement("div");
    div.className = "player-card";
    div.innerHTML = `
      <div class="player-left">
        <div class="avatar" style="background:${colors[player.token % colors.length]}">${animalTokens[player.token % animalTokens.length]}</div>
        <div>
          <div><strong>${player.name}</strong> ${isMe ? "(คุณ)" : ""}</div>
          <div>ช่อง ${player.position} ${player.connected ? "🟢" : "⚪️"}</div>
        </div>
      </div>
      <div>${isCurrent ? "👑 ตานี้" : ""}</div>
    `;
    playersList.appendChild(div);
  });
}

function renderControls() {
  if (!state) return;
  const me = state.players.find((p) => p.id === myPlayerId);
  const myIndex = state.players.findIndex((p) => p.id === myPlayerId);
  const myTurn = state.turnIndex === myIndex;
  const owner = state.players[0]?.id === myPlayerId;

  startGameBtn.style.display = !state.started && owner ? "block" : "none";
  rollDiceBtn.disabled = !state.started || !myTurn || !!state.pendingQuiz || !!state.winner || !me?.connected;

  if (state.winner) {
    const winner = state.players.find((p) => p.id === state.winner);
    statusText.textContent = `🎉 ${winner?.name || "มีผู้เล่น"} ชนะแล้ว`;

    winnerTitle.textContent = `🎉 ${winner?.name || "ผู้เล่น"} ชนะ!`;
    winnerText.textContent = "ขอบคุณที่เล่นเกมบันไดงู Fake or Fact เสร็จแล้วอย่าลืมกดไปตอบ Google Forms นะ";
    winnerModal.classList.remove("hidden");
  } else {
    statusText.textContent = state.lastAction || "รอผู้เล่น";
    winnerModal.classList.add("hidden");
  }
}

function maybeShowQuiz() {
  if (!state?.pendingQuiz) {
    quizModal.classList.add("hidden");
    return;
  }

  if (state.pendingQuiz.playerId === myPlayerId) {
    quizQuestion.textContent = state.pendingQuiz.question.text;
    quizModal.classList.remove("hidden");
  } else {
    quizModal.classList.add("hidden");
  }
}

function render() {
  roomInfo.textContent = state ? `ห้อง: ${state.code}` : "ยังไม่ได้เข้าห้อง";
  buildBoard();
  renderPlayers();
  renderControls();
  maybeShowQuiz();
}

createRoomBtn.addEventListener("click", () => {
  const name = getName();
  if (!name) return alert("กรุณาใส่ชื่อก่อน");
  localStorage.setItem("snake_name", name);
  socket.emit("room:create", { name });
});

joinRoomBtn.addEventListener("click", () => {
  const name = getName();
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!name || !roomCode) return alert("กรุณาใส่ชื่อและรหัสห้อง");
  localStorage.setItem("snake_name", name);
  socket.emit("room:join", { name, roomCode });
});

startGameBtn.addEventListener("click", () => {
  if (!state) return;
  socket.emit("game:start", { roomCode: state.code, playerId: myPlayerId });
});

rollDiceBtn.addEventListener("click", () => {
  if (!state) return;
  diceDisplay.textContent = ["⚀","⚁","⚂","⚃","⚄","⚅"][Math.floor(Math.random() * 6)];
  socket.emit("game:rollDice", { roomCode: state.code, playerId: myPlayerId });
});

trueBtn.addEventListener("click", () => {
  socket.emit("quiz:answer", { roomCode: state.code, playerId: myPlayerId, answer: true });
  quizModal.classList.add("hidden");
  pendingResultForMe = true;
});

falseBtn.addEventListener("click", () => {
  socket.emit("quiz:answer", { roomCode: state.code, playerId: myPlayerId, answer: false });
  quizModal.classList.add("hidden");
  pendingResultForMe = true;
});

closeResultBtn.addEventListener("click", () => {
  resultModal.classList.add("hidden");
});
closeWinnerBtn.addEventListener("click", () => {
  winnerModal.classList.add("hidden");
});

socket.on("room:joined", ({ roomCode, playerId }) => {
  saveIdentity(getName(), roomCode, playerId);
  lobbyView.classList.add("hidden");
  gameView.classList.remove("hidden");
});

socket.on("room:update", (newState) => {
  state = newState;
  render();
});

socket.on("quiz:result", ({ isCorrect, explanation, playerId }) => {
  const targetIsMe = playerId === myPlayerId;
  if (targetIsMe || pendingResultForMe) {
    resultTitle.textContent = isCorrect ? "ตอบถูก! เดินหน้า 1 ช่อง" : "ตอบผิด! ถอยหลัง 1 ช่อง";
    resultExplanation.textContent = explanation;
    resultModal.classList.remove("hidden");
    pendingResultForMe = false;
  }
});

socket.on("room:error", (message) => {
  alert(message);
});

maybeReconnect();
// 🔄 ปุ่มเล่นใหม่
restartBtn.addEventListener("click", () => {
  location.reload();
});

// ❌ ปุ่มออกจากเกม
exitBtn.addEventListener("click", () => {
  localStorage.removeItem("snake_player_id");
  localStorage.removeItem("snake_room_code");
  location.reload();
});