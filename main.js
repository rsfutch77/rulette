console.log("DEBUG: main.js loaded");
import { auth } from "./firebase-init.js";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js"; // FIXME: Bare import replaced with CDN import for browser compatibility

import { db } from "./firebase-init.js";

// CardManager and sample decks (using dynamic import for CommonJS compatibility)
import { CardManager } from './cardManager.js';
let cardManager; // Make cardManager accessible globally
let cardManagerInitialized = false; // Flag to track initialization status
import { loadCardData } from './cardModels.js';

// FIXME: DEV ONLY - Helper for managing a local dev UID for localhost testing
function getDevUID() {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    let devUID = localStorage.getItem("devUID");
    if (!devUID) {
      devUID = prompt("Enter a test UID for local development (will be saved in localStorage):");
      if (devUID) {
        localStorage.setItem("devUID", devUID);
      }
    }
    return devUID;
  }
  return null;
}

// Helper to detect if user is in dev/test environment
function isDevEnvironment() {
  const currentUser = getCurrentUser();
  return (
    // Localhost environment
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ||
    // Dev user (has isDev flag or specific dev UID patterns)
    (currentUser && (currentUser.isDev || currentUser.uid.includes("dev") || currentUser.uid.includes("test")))
  );
}

// Helper to get dice roll values (either from dev input or random)
function getDiceRoll() {
  if (isDevEnvironment()) {
    const devRoll1Input = document.getElementById("dev-roll1");
    const devRoll2Input = document.getElementById("dev-roll2");
    
    if (devRoll1Input && devRoll2Input && devRoll1Input.value && devRoll2Input.value) {
      const roll1 = parseInt(devRoll1Input.value);
      const roll2 = parseInt(devRoll2Input.value);
      
      // Validate dice values (1-6)
      if (roll1 >= 1 && roll1 <= 6 && roll2 >= 1 && roll2 <= 6) {
        // Clear the inputs after use
        devRoll1Input.value = "";
        devRoll2Input.value = "";
        return { roll1, roll2, total: roll1 + roll2, isDev: true };
      }
    }
  }
  
  // Default random roll
  const roll1 = Math.floor(Math.random() * 6) + 1;
  const roll2 = Math.floor(Math.random() * 6) + 1;
  return { roll1, roll2, total: roll1 + roll2, isDev: false };
}

// Helper to get turn order dice roll values (either from dev input or random)
function getTurnOrderDiceRoll() {
  if (isDevEnvironment()) {
    const devTurnRoll1Input = document.getElementById("dev-turn-roll1");
    const devTurnRoll2Input = document.getElementById("dev-turn-roll2");
    
    if (devTurnRoll1Input && devTurnRoll2Input && devTurnRoll1Input.value && devTurnRoll2Input.value) {
      const roll1 = parseInt(devTurnRoll1Input.value);
      const roll2 = parseInt(devTurnRoll2Input.value);
      
      // Validate dice values (1-6)
      if (roll1 >= 1 && roll1 <= 6 && roll2 >= 1 && roll2 <= 6) {
        // Clear the inputs after use
        devTurnRoll1Input.value = "";
        devTurnRoll2Input.value = "";
        return { total: roll1 + roll2, isDev: true };
      }
    }
  }
  
  // Default random roll
  const roll1 = Math.floor(Math.random() * 6) + 1;
  const roll2 = Math.floor(Math.random() * 6) + 1;
  return { total: roll1 + roll2, isDev: false };
}

// Helper to get the current user, supporting localhost dev mode
function getCurrentUser() {
  if (auth.currentUser) return auth.currentUser;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    // Use the dev UID from prompt/localStorage for consistent identity
    const devUID = getDevUID() || "dev-local-uid";
    return {
      uid: devUID,
      displayName: "Dev User",
      email: "dev@localhost"
    };
  }
  return null;
}

// FIXME: The code assumed card data was available synchronously, but it is loaded asynchronously.
// Refactored to load card data before initializing CardManager.
(async () => {
  const {
    deckType1,
    deckType2,
    deckType3,
    deckType4,
    deckType5,
    deckType6
  } = await loadCardData();

  // DEBUG LOGS to validate loaded card arrays
  console.log("deckType1:", deckType1, "type:", typeof deckType1, Array.isArray(deckType1));
  console.log("deckType2:", deckType2, "type:", typeof deckType2, Array.isArray(deckType2));
  console.log("deckType3:", deckType3, "type:", typeof deckType3, Array.isArray(deckType3));
  console.log("deckType4:", deckType4, "type:", typeof deckType4, Array.isArray(deckType4));
  console.log("deckType5:", deckType5, "type:", typeof deckType5, Array.isArray(deckType5));
  console.log("deckType6:", deckType6, "type:", typeof deckType6, Array.isArray(deckType6));

  // Initialize CardManager with generalized decks
  cardManager = new CardManager({
    deckType1,
    deckType2,
    deckType3,
    deckType4,
    deckType5,
    deckType6
  });
  
  // Set the initialization flag to true
  cardManagerInitialized = true;
  console.log("[CARD MANAGER] Successfully initialized with all card decks");

  // ...rest of your initialization code that depends on cardManager...
})();
import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc, // FIXME: Added for join game functionality
  arrayUnion, // FIXME: Added for join game functionality
  onSnapshot // FIXME: Added for real-time game updates
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfoDiv = document.getElementById("user-info");
const userNameP = document.getElementById("user-name");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const gameCodeHeader = document.getElementById("game-code-header");

// Game page elements
const gamePage = document.getElementById("game-page");
const gameJoinCodeDiv = document.getElementById("game-join-code");
const playersScoresDiv = document.getElementById("players-scores");
const gameLogoutBtn = document.getElementById("game-logout-btn");
const startGameBtn = document.getElementById("start-game-btn");
const turnOrderDiv = document.getElementById("turn-order");
// Inspiration Card Modal elements
const inspirationModal = document.getElementById("inspiration-card-modal");
const inspirationTitle = document.getElementById("inspiration-card-title");
const inspirationQuestion = document.getElementById("inspiration-card-question");
const inspirationChoices = document.getElementById("inspiration-card-choices");
const inspirationResult = document.getElementById("inspiration-card-result");
// Prescription Sheet Modal elements
// Notification Modal elements
// FIXME: These elements might not be available when the script runs initially
let notificationModal, notificationTitle, notificationMessage, notificationCloseBtn;

// Function to initialize notification elements
function initNotificationElements() {
  console.log("DEBUG: Initializing notification elements");
  notificationModal = document.getElementById("notification-modal");
  notificationTitle = document.getElementById("notification-title");
  notificationMessage = document.getElementById("notification-message");
  notificationCloseBtn = document.getElementById("notification-close-btn");
  
  console.log("DEBUG: Notification elements:", {
    modal: notificationModal,
    title: notificationTitle,
    message: notificationMessage,
    closeBtn: notificationCloseBtn
  });
  
  // Set up close button if it exists
  if (notificationCloseBtn) {
    notificationCloseBtn.onclick = () => {
      console.log("DEBUG: Close button clicked");
      if (notificationModal) notificationModal.style.display = "none";
    };
  }
}

// Initialize notification elements when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initNotificationElements);

// Function to show in-app notification
function showNotification(message, title = "Notification", callback = null) {
  console.log("DEBUG: showNotification called with:", { message, title });
  
  // Make sure elements are initialized
  if (!notificationModal) {
    console.log("DEBUG: Notification modal not initialized, initializing now");
    initNotificationElements();
  }
  
  // Check if elements exist
  if (!notificationModal || !notificationTitle || !notificationMessage) {
    console.error("ERROR: Notification elements not found, falling back to alert");
    alert(`${title}: ${message}`);
    if (callback && typeof callback === 'function') callback();
    return;
  }
  
  notificationTitle.textContent = title;
  notificationMessage.textContent = message;
  notificationModal.style.display = "flex";
  console.log("DEBUG: Notification displayed");
  
  // Set up close button
  notificationCloseBtn.onclick = () => {
    console.log("DEBUG: Close button clicked");
    notificationModal.style.display = "none";
    if (callback && typeof callback === 'function') {
      callback();
    }
  };
}

// Expose a helper for triggering test notifications
window.testNotification = function(message = "Test notification", title = "Test") {
  console.log("DEBUG: Manual test notification triggered");
  showNotification(message, title);
};


let currentGameCode = null;
// Auto-resume game on page load if user is authenticated and has a game in progress
onAuthStateChanged(auth, async (user) => {
  const storedCode = localStorage.getItem("currentGameCode");
  console.log("DEBUG: onAuthStateChanged fired");
  console.log("DEBUG: storedCode =", storedCode);
  console.log("DEBUG: user =", user ? (user.displayName || user.email || user.uid) : null);

  // FIXME: Skip login page on localhost by injecting a dev user
  console.log("DEBUG: Entered dev user injection block");
  if (!user && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    user = {
      uid: getDevUID() || "dev-local-uid",
      displayName: "Dev User",
      email: "dev@localhost",
      // Add any other properties your app expects from a Firebase user
    };
    console.log("DEBUG: Injected dev user for localhost:", user);
  }
  // DEBUG: Log user and auth.currentUser after dev injection
  console.log("DEV: user", user, "auth.currentUser", auth.currentUser);

  if (user) {
    // Check if user is in a game
    if (storedCode) {
      const gameRef = doc(db, "games", storedCode);
      const gameSnap = await getDoc(gameRef);
      if (gameSnap.exists()) {
        const gameData = gameSnap.data();
        console.log("DEBUG: gameData.players =", gameData.players);
        if (
          Array.isArray(gameData.players) &&
          gameData.players.some(p => p.uid === user.uid)
        ) {
          console.log("DEBUG: User is in the game, resuming game page");
          await showGamePage(storedCode);
          return;
        } else {
          console.log("DEBUG: User is NOT in the players array for this game");
        }
      } else {
        console.log("DEBUG: Game not found in Firestore for storedCode");
      }
    }
    // Not in a game, show user info and game/join buttons
    if (loginBtn) loginBtn.style.display = "none";
    if (userInfoDiv) userInfoDiv.style.display = "block";
    if (userNameP) userNameP.textContent = `Logged in as: ${user.displayName || user.email}`;
    if (createGameBtn) createGameBtn.style.display = "inline-block";
    if (joinGameBtn) joinGameBtn.style.display = "inline-block";
    if (gameCodeHeader) {
      if (storedCode) {
        gameCodeHeader.textContent = `Current Game Code: ${storedCode}`;
        gameCodeHeader.style.display = "block";
      } else {
        gameCodeHeader.textContent = "";
        gameCodeHeader.style.display = "none";
      }
    }
    if (gamePage) gamePage.style.display = "none";
  } else {
    // Not logged in
    if (loginBtn) loginBtn.style.display = "inline-block";
    if (userInfoDiv) userInfoDiv.style.display = "none";
    if (userNameP) userNameP.textContent = "";
    if (createGameBtn) createGameBtn.style.display = "none";
    if (joinGameBtn) joinGameBtn.style.display = "none";
    if (gameCodeHeader) {
      gameCodeHeader.textContent = "";
      gameCodeHeader.style.display = "none";
    }
    if (gamePage) gamePage.style.display = "none";
    currentGameCode = null;
    localStorage.removeItem("currentGameCode");
  }
});

// Logout handler
async function handleLogout() {
  try {
    await signOut(auth);
    // UI will update via onAuthStateChanged
  } catch (error) {
    alert("Logout failed: " + error.message);
  }
}

// Attach logout handler to both logout buttons
if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
if (gameLogoutBtn) gameLogoutBtn.addEventListener("click", handleLogout);

const provider = new GoogleAuthProvider();

loginBtn.addEventListener("click", async () => {
  try {
    // Use redirect instead of popup to avoid COOP/COEP issues
    // await signInWithPopup(auth, provider);
    await signInWithRedirect(auth, provider);
  } catch (error) {
    alert("Login failed: " + error.message);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert("Logout failed: " + error.message);
  }
});
// Join Game UI logic
const joinGameForm = document.getElementById("join-game-form");
const joinGameCodeInput = document.getElementById("join-game-code");
const submitJoinGameBtn = document.getElementById("submit-join-game-btn");
const joinGameError = document.getElementById("join-game-error");

joinGameBtn.addEventListener("click", () => {
  joinGameForm.style.display = "block";
  joinGameError.textContent = "";
  joinGameCodeInput.value = "";
  joinGameCodeInput.focus();
});

// Handle join game submit
submitJoinGameBtn.addEventListener("click", async () => {
  const code = joinGameCodeInput.value.trim();
  joinGameError.textContent = "";
  if (!code) {
    joinGameError.textContent = "Please enter a game code.";
    return;
  }
  let user = getCurrentUser();

  // FIXME: DEV ONLY - Allow local devs to use a fake UID for testing on localhost
  if (!user && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    const devUID = getDevUID();
    if (devUID) {
      user = { uid: devUID, displayName: "Dev User", email: "dev@localhost", isDev: true };
    }
  }

  if (!user) {
    joinGameError.textContent = "You must be logged in to join a game.";
    return;
  }
  console.log("DEBUG: joinGame function called"); // FIXME: Remove after debugging
  try {
    const gameRef = doc(db, "games", code);
    const gameSnap = await getDoc(gameRef);
    if (!gameSnap.exists()) {
      joinGameError.textContent = "Game not found.";
      return;
    }
    const gameData = gameSnap.data();
    // Check if user is already in players
    if (Array.isArray(gameData.players) && gameData.players.some(p => p.uid === user.uid)) {
      // Always update localStorage so auto-resume works
      localStorage.setItem("currentGameCode", code);
      joinGameError.textContent = "You are already in this game.";
      // Optionally, show the game page immediately
      await showGamePage(code);
      return;
    }
    // Add user to players array
    await updateDoc(gameRef, {
      players: arrayUnion({
        uid: user.uid,
        name: user.displayName || "",
        email: user.email || "",
        isHost: false,
        ready: false,
        progress: [false, false, false, false, false, false] // Generic game progression
      })
    });
    // Store joined game code for auto-resume
    localStorage.setItem("currentGameCode", code);
    const updatedSnap = await getDoc(gameRef);
    console.log("User joined. Players array:", updatedSnap.data().players);
const playersWithPositions = updatedSnap.data().players.map((player, index) => ({
  ...player,
  position: index * 7
}));
await updateDoc(gameRef, { players: playersWithPositions });
    
    // FIXME: If the host is able to join their own game again, this is a bug. The host should not be able to join as a regular player.
    joinGameError.style.color = "green";
    joinGameError.textContent = "Joined game!";
    // Optionally, update UI to reflect joined state, hide form, etc.
    setTimeout(() => {
      joinGameForm.style.display = "none";
      joinGameError.style.color = "red";
      joinGameError.textContent = "";
    }, 1500);
    // After join, show game page
    await showGamePage(code);
  } catch (err) {
    joinGameError.textContent = "Failed to join game: " + err.message;
  }
});

// Show the game page with player info and join code
async function showGamePage(gameCode) {
  console.log("DEBUG: showGamePage called with code:", gameCode);
  // Hide login/user-info UI
  const container = document.querySelector(".container");
  if (container) {
    container.style.display = "none";
    console.log("DEBUG: .container hidden");
  } else {
    console.error("DEBUG: .container not found");
  }
  // Show game page
  if (gamePage) {
    gamePage.style.display = "block";
    gamePage.style.border = "4px solid red"; // DEBUG: Make visible
    gamePage.style.background = "#ffeedd";   // DEBUG: Make visible
    console.log("DEBUG: #game-page shown");
  } else {
    console.error("DEBUG: #game-page not found");
  }
  // Set join code
  if (gameJoinCodeDiv) {
    gameJoinCodeDiv.textContent = `Game Code: ${gameCode}`;
    console.log("DEBUG: Set game code header");
  } else {
    console.error("DEBUG: #game-join-code not found");
  }
  // Fetch game data
  const gameRef = doc(db, "games", gameCode);
  // Ensure dev user is in the player list on localhost
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    const devUser = getCurrentUser();
    const gameSnap = await getDoc(gameRef);
    if (gameSnap.exists()) {
      const gameData = gameSnap.data();
      if (Array.isArray(gameData.players) && !gameData.players.some(p => p.uid === devUser.uid)) {
        // Add dev user to players array
        await updateDoc(gameRef, {
          players: arrayUnion({
            uid: devUser.uid,
            name: devUser.displayName || "",
            email: devUser.email || "",
            isHost: false,
            ready: false,
            progress: [false, false, false, false, false, false]
          })
        });
        console.log("DEBUG: Dev user added to player list for localhost");
// Assign starting positions based on player index (position = index * 7)
        const updatedDevSnap = await getDoc(gameRef);
        const playersWithPositions = updatedDevSnap.data().players.map((player, index) => ({
          ...player,
          position: index * 7,
        }));
        await updateDoc(gameRef, { players: playersWithPositions });
        console.log("DEBUG: Player positions updated based on index");
      }
    }
  }
  // Listen for real-time updates to the game document
  if (window._gameUnsub) window._gameUnsub(); // Unsubscribe previous listener if any
  window._gameUnsub = onSnapshot(gameRef, async (gameSnap) => {
      if (!gameSnap.exists()) {
          if (playersScoresDiv) {
              playersScoresDiv.innerHTML = "<span style='color:red;'>Game not found.</span>";
          }
          if (turnOrderDiv) turnOrderDiv.innerHTML = "";
          if (startGameBtn) startGameBtn.style.display = "none";
          console.error("DEBUG: Game not found in Firestore");
          return;
      }
      const gameData = gameSnap.data();


      // Display player names and scores
      if (Array.isArray(gameData.players) && playersScoresDiv) {
          playersScoresDiv.innerHTML = "";
          // Define a color palette for up to 6 players
          const playerColors = [
              "#d45151",
              "#cf9042",
              "#dee339",
              "#50d834",
              "#9b59b6",
              "#6851ea"
          ];
          // Use Firebase Auth to get the current user
          //const currentUser = getCurrentUser();
          //console.log("RENDER: currentUser", currentUser);
          gameData.players.forEach((player, idx) => {
              // Ensure player.progress exists and is an array
              if (!player.progress || !Array.isArray(player.progress)) {
                  player.progress = [false, false, false, false, false, false]; // Generic game progression
              }
              // Assign color by index
              const color = playerColors[idx % playerColors.length];
              // Placeholder for score (default 0)
              const playerDiv = document.createElement("div");
              playerDiv.style.display = "flex";
              playerDiv.style.flexDirection = "column";
              playerDiv.style.alignItems = "center";
          
              // Only show ready status and button if game has NOT started (no turnOrder yet)
              let readyStatusHTML = "";
              let readyButtonHTML = "";
              if (!Array.isArray(gameData.turnOrder) || gameData.turnOrder.length === 0) {
                  // Ready status display
                  const readyStatus = player.ready ? "✅ Ready" : "❌ Not Ready";
                  readyStatusHTML = `<span class="player-ready-status" data-uid="${player.uid}">${readyStatus}</span>`;
                  // Show "Ready" button only for the current user
                  if (currentUser && player.uid === currentUser.uid) {
                      readyButtonHTML = `
                          <button class="ready-btn" data-uid="${player.uid}" style="margin-top:4px;">
                          ${player.ready ? "Unready" : "Ready"}
                          </button>
                      `;
                  }
              }
          
              // Turn indicator
              let turnIndicatorHTML = "";
              if (typeof gameData.currentTurn === "number" && idx === gameData.currentTurn) {
                  turnIndicatorHTML = `<div class="turn-indicator" title="Current Turn">⬆️</div>`;
              }
          
              playerDiv.innerHTML = `
                  ${turnIndicatorHTML}
                  <span style="font-weight:bold; color: ${color};">${player.name || player.email || "Player"}</span>
                  <div class="progress-dots">
                    ${player.progress.map(p => `<div class="progress-dot ${p ? 'completed' : ''}"></div>`).join('')}
                  </div>
                  ${readyStatusHTML}
                  ${readyButtonHTML}
              `;
              playersScoresDiv.appendChild(playerDiv);
          });

          // --- PLAYER TOKEN RENDERING ---
          // Remove any existing tokens
          document.querySelectorAll('.player-token').forEach(el => el.remove());
          // Place each player's token based on their position (0-41)
          const boardRows = document.querySelectorAll('#game-board > .row-0, #game-board > .row-1, #game-board > .row-2, #game-board > .row-3, #game-board > .row-4, #game-board > .row-5');
          if (boardRows.length === 6) {
              gameData.players.forEach((player, idx) => {
                  const pos = typeof player.position === "number" ? player.position : 0;
                  const rowIdx = Math.floor(pos / 7);
                  const colIdx = pos % 7;
                  const rowDiv = boardRows[rowIdx];
                  if (rowDiv) {
                      const cell = rowDiv.querySelectorAll('.board-cell')[colIdx];
                      if (cell) {
                          const color = playerColors[idx % playerColors.length];
                          const token = document.createElement('div');
                          token.className = 'player-token';
                          token.title = player.name || player.email || "Player";
                          token.style.background = color;
                          token.style.border = "2.5px solid #fff";
                          token.style.boxSizing = "border-box";
                          token.style.position = "relative";
                          token.style.marginRight = "4px";
                          token.style.left = `${idx * 22}px`; // offset tokens horizontally
                          token.style.zIndex = 10 + idx;
                          token.setAttribute('data-uid', player.uid);
                          cell.appendChild(token);
                      }
                  }
              });
          }
  
          // Add event listeners for ready buttons
          document.querySelectorAll(".ready-btn").forEach(btn => {
              btn.addEventListener("click", async (e) => {
                  const uid = btn.getAttribute("data-uid");
                  if (!currentUser || currentUser.uid !== uid) return;
                  // Toggle ready status for current user
                  const updatedPlayers = gameData.players.map(p =>
                      p.uid === currentUser.uid ? { ...p, ready: !p.ready } : p
                  );
                  await updateDoc(gameRef, { players: updatedPlayers });
                  // No need for optimistic update; UI will update on next snapshot
              });
          });

          // --- SHOW INSPIRATION CARD FROM FIRESTORE ---
          if (gameData.currentInspiration) {
              const insp = gameData.currentInspiration;
              const isCurrentPlayer = currentUser &&
                  gameData.players[gameData.currentTurn] &&
                  gameData.players[gameData.currentTurn].uid === currentUser.uid;

              if (!(isCurrentPlayer && insp.selectedIndex === null && inspirationModal.style.display === "flex")) {
                  inspirationModal.style.display = "flex";
                  inspirationQuestion.textContent = insp.question;
                  if (inspirationTitle) {
                      const currentPlayerName = gameData.players[gameData.currentTurn]?.name || `Player ${gameData.currentTurn + 1}`;
                      inspirationTitle.textContent = isCurrentPlayer
                          ? "You have been inspired!"
                          : `You are viewing ${currentPlayerName}'s Inspiration`;
                  }
                  inspirationChoices.innerHTML = "";
                  insp.choices.forEach((choice, idx) => {
                      const btn = document.createElement("button");
                      btn.textContent = choice;
                      btn.style.margin = "0.5rem";
                      btn.disabled = true;
                      btn.style.opacity = "0.5";
                      if (typeof insp.selectedIndex === 'number' && idx === insp.selectedIndex) {
                          btn.style.border = '2px solid #333';
                      }
                      inspirationChoices.appendChild(btn);
                  });
                  if (typeof insp.selectedIndex === 'number') {
                      const correct = insp.wasCorrect;
                      const chosen = insp.choices[insp.selectedIndex] || '';
                      inspirationResult.textContent = `Selected: ${chosen} - ${correct ? 'Correct!' : 'Incorrect!'}`;
                      inspirationResult.style.color = correct ? 'green' : 'red';
                      setTimeout(() => {
                          inspirationModal.style.display = 'none';
                          if (inspirationTitle) inspirationTitle.textContent = '';
                      }, 2000);
                  } else {
                      inspirationResult.textContent = '';
                  }
              }
          } else {
              inspirationModal.style.display = 'none';
              if (inspirationTitle) inspirationTitle.textContent = '';
          }

          // --- SHOW TRAUMA NOTIFICATION FROM FIRESTORE ---
          if (gameData.currentTrauma) {
              const tr = gameData.currentTrauma;
              showNotification(tr.message, tr.title || 'Trauma!');
              if (currentUser && tr.triggeredBy === currentUser.uid) {
                  setTimeout(() => {
                      updateDoc(gameRef, { currentTrauma: null });
                  }, 2000);
              }
          }
// --- ROLL BUTTON LOGIC ---
const rollBtn = document.getElementById("roll-btn");
const rollResultSpan = document.getElementById("roll-result");
if (rollBtn) {
    // Remove any previous click handlers
    const newRollBtn = rollBtn.cloneNode(true);
    rollBtn.parentNode.replaceChild(newRollBtn, rollBtn);

    // Determine if it's this user's turn
    let isMyTurn = false;
    if (
        Array.isArray(gameData.players) &&
        typeof gameData.currentTurn === "number" &&
        gameData.players[gameData.currentTurn] &&
        currentUser &&
        gameData.players[gameData.currentTurn].uid === currentUser.uid
    ) {
        isMyTurn = true;
// Test the notification system
                console.log("DEBUG: Triggering trauma notification");
    }
    newRollBtn.disabled = !isMyTurn;
    newRollBtn.style.opacity = isMyTurn ? "1" : "0.5";

    newRollBtn.onclick = async () => {
        if (!isMyTurn) return;
        // DEBUG: Print all player objects at the start of the turn
        console.debug("[DEBUG] gameData.players at start of turn:", gameData.players);
        // Roll 2d6 (with dev override support)
        const diceResult = getDiceRoll();
        const { roll1, roll2, total, isDev } = diceResult;
        const devIndicator = isDev ? " [DEV ROLL]" : "";
        rollResultSpan.textContent = `You rolled: ${roll1} + ${roll2} = ${total}${devIndicator}`;

        // Move the player's token
        const playerIdx = gameData.currentTurn;
        const player = gameData.players[playerIdx];
        const oldPos = typeof player.position === "number" ? player.position : 0;
        const boardSize = 6 * 7; // 6 rows x 7 columns = 42 spaces
        let newPos = oldPos + total;
        if (newPos >= boardSize) newPos = newPos % boardSize;
        
        }

        // Only trigger for "Inspiration" spaces (inspiration card)
        // Use landedTypeFinal in case player was moved by trauma rule
        if (landedTypeFinal === "Inspiration") {
            // Draw an inspiration card from the correct deck for the current player's row
                        // FIXME: Bug was here - currentPlayer was undefined. Use player (current turn's player) instead.
                        // Assumes player.row is one of: 'adult', 'teen', 'child'
                        // Determine the row type based on the row index
                        const rowTypeMap = ["baby", "child", "teen", "adult", "elderly", "beyond"];
                        const rowIdx = Math.floor(newPos / 7);
                        player.row = rowTypeMap[rowIdx] || "adult"; // Default to "adult" if out of bounds
                        // DEBUG: Log the player object and its row before determining deck type
                        console.debug("[DEBUG] Player object before deck type:", player);
                        
                        // FIXME: Check if cardManager is fully initialized before trying to use it
                        if (!cardManagerInitialized) {
                            console.error("[INSPIRATION DEBUG] cardManager is not fully initialized. Card data is still loading.");
                            showNotification("Game data is still loading. Please try again in a moment.", "Loading...");
                            return;
                        }
                        
                        const deckType = cardManager.getDeckTypeForPlayer(player);
                        // DEBUG: Log the space and deck type before drawing a card
                        console.debug(`[DEBUG] Player "${player && player.name ? player.name : "unknown"}" attempting to draw from deck "${deckType}" on space "${landedTypeFinal}" (row: ${player && player.row ? player.row : "unknown"})`);
                        const inspirationCard = cardManager.draw(deckType);
        // Persist card data so all players can see the question
        await updateDoc(gameRef, {
            currentInspiration: {
                question: inspirationCard.question,
                choices: inspirationCard.choices,
                correctIndex: inspirationCard.correctIndex,
                selectedIndex: null,
                wasCorrect: null,
                deckType
            }
        });

        // Defer modal display to allow token movement to be visible
        setTimeout(() => {
         if (inspirationTitle) inspirationTitle.textContent = "You have been inspired!";
         inspirationQuestion.textContent = inspirationCard.question;
         inspirationResult.textContent = "";
         inspirationChoices.innerHTML = "";
        
            // Only current player can answer
            const isCurrentPlayer = currentUser && player && player.uid === currentUser.uid;
        
            inspirationCard.choices.forEach((choice, idx) => {
                const btn = document.createElement("button");
                btn.textContent = choice;
                btn.style.margin = "0.5rem";
                btn.disabled = !isCurrentPlayer;
                btn.style.opacity = isCurrentPlayer ? "1" : "0.5";
                btn.onclick = async () => {
                    // Disable all buttons
                    Array.from(inspirationChoices.children).forEach(b => b.disabled = true);
                    // Show result
                    const correct = idx === inspirationCard.correctIndex;
                    inspirationResult.textContent = correct ? "Correct!" : "Incorrect!";
                    inspirationResult.style.color = correct ? "green" : "red";
                    // Broadcast result to all players
                    await updateDoc(gameRef, {
                        currentInspiration: {
                            question: inspirationCard.question,
                            choices: inspirationCard.choices,
                            correctIndex: inspirationCard.correctIndex,
                            selectedIndex: idx,
                            wasCorrect: correct,
                            deckType
                        }
                    });
                    setTimeout(() => {
                        inspirationModal.style.display = "none";
                        if (inspirationTitle) inspirationTitle.textContent = "";
                        continueTurnAfterinspiration(inspirationCard, deckType, correct);
                    }, 2000);
                };
                inspirationChoices.appendChild(btn);
            });

            // If not current player, auto-close after 2s when result is shown by another player (TODO: sync in multiplayer)
            if (!isCurrentPlayer) {
                // Wait for result to be shown, then close (simulate for now)
                setTimeout(() => {
                    inspirationModal.style.display = "none";
                    continueTurnAfterinspiration(inspirationCard, deckType, false); // Assuming auto-close means incorrect for now
                }, 2500);
            }

            // Pause turn logic here; continue in continueTurnAfterinspiration
            }, 600); // 600ms delay to allow token movement to be visible before modal
            return;
        }
        
        // If not an inspiration space, continue as normal
        async function continueTurnAfterinspiration(inspirationCard, deckType, correct) {
            const currentPlayer = gameData.players[playerIdx];
            let notificationMessage = "";

            if (inspirationCard && deckType) {
                // FIXME: Check if cardManager is fully initialized before trying to use it
                if (!cardManagerInitialized) {
                    console.error("[INSPIRATION DEBUG] cardManager is not fully initialized in continueTurnAfterinspiration. Card data is still loading.");
                    return;
                }
                cardManager.discard(deckType, inspirationCard);
                console.log(`Discarded Inspiration Card from ${deckType} deck.`);

                // Determine stage index based on deckType (assuming a mapping)
                const stageMap = {
                    baby_inspiration: 0,
                    child_inspiration: 1,
                    teen_inspiration: 2,
                    adult_inspiration: 3,
                    elderly_inspiration: 4,
                    beyond_inspiration: 5
                };
                const stageIndex = stageMap[deckType];

                if (correct && stageIndex !== undefined) {
                    if (!currentPlayer.progress[stageIndex]) {
                        currentPlayer.progress[stageIndex] = true;
                        notificationMessage = `You gained progress in the ${deckType.replace('_inspiration', '')} stage!`;
                        showNotification(notificationMessage, "Progress Gained!");
                    } else {
                        notificationMessage = `You already have progress in the ${deckType.replace('_inspiration', '')} stage.`;
                        showNotification(notificationMessage, "Already Gained Progress");
                    }
                } else if (!correct) {
                    notificationMessage = "You did not gain progress this time.";
                    showNotification(notificationMessage, "No Progress");
                }
            }

            // Update player position and progress in array
            const updatedPlayers = gameData.players.map((p, idx) =>
                idx === playerIdx ? { ...p, position: newPos, progress: currentPlayer.progress } : p
            );
        
            // Advance turn
            let nextTurn = playerIdx + 1;
            if (nextTurn >= gameData.players.length) nextTurn = 0;
        
            // Update Firestore
            await updateDoc(gameRef, {
                players: updatedPlayers,
                currentTurn: nextTurn,
                currentInspiration: null
            });
        
            // Optionally, disable the button until next turn
            newRollBtn.disabled = true;
            newRollBtn.style.opacity = "0.5";
        }

        // Update player position in array
        const updatedPlayers = gameData.players.map((p, idx) =>
            idx === playerIdx ? { ...p, position: newPos } : p
        );

        // Advance turn
        let nextTurn = playerIdx + 1;
        if (nextTurn >= gameData.players.length) nextTurn = 0;

        // Update Firestore
        await updateDoc(gameRef, {
            players: updatedPlayers,
            currentTurn: nextTurn
        });

        // Optionally, disable the button until next turn
        newRollBtn.disabled = true;
        newRollBtn.style.opacity = "0.5";
    };
    // FIXME: Roll result was previously cleared here when turn changed, causing it to disappear too quickly.
    // To keep the roll result visible longer, this line is now commented out.
    // if (!isMyTurn) rollResultSpan.textContent = "";
}

// Show/hide dev dice controls based on environment
const devDiceControls = document.getElementById("dev-dice-controls");
if (devDiceControls) {
    if (isDevEnvironment()) {
        devDiceControls.style.display = "block";
    } else {
        devDiceControls.style.display = "none";
    }
}

// Show/hide dev turn order controls based on environment
const devTurnOrderControls = document.getElementById("dev-turn-order-controls");
if (devTurnOrderControls) {
    if (isDevEnvironment()) {
        devTurnOrderControls.style.display = "block";
    } else {
        devTurnOrderControls.style.display = "none";
    }
}
          //console.log("DEBUG: Player names and scores rendered");
  
          // --- START GAME BUTTON LOGIC ---
          if (startGameBtn) {
              // Hide the start button if the game has started (turnOrder exists and is non-empty)
              if (Array.isArray(gameData.turnOrder) && gameData.turnOrder.length > 0) {
                  startGameBtn.style.display = "none";
              } else {
                  // Determine host (first player in array)
                  const isHost = currentUser && gameData.players[0] && gameData.players[0].uid === currentUser.uid;
                  // All players ready?
                  const allReady = gameData.players.length > 0 && gameData.players.every(p => p.ready);
                  // Only show button to host
                  if (isHost) {
                      startGameBtn.style.display = "inline-block";
                      startGameBtn.disabled = !allReady;
                      startGameBtn.style.opacity = allReady ? "1" : "0.5";
                  } else {
                      startGameBtn.style.display = "none";
                  }
              }
          }
  
          // --- TURN ORDER DISPLAY ---
          if (turnOrderDiv) {
              // Show turn order only if the game has started (turnOrder exists) AND the first roll has NOT taken place (currentTurn is undefined or null)
              if (
                  gameData.turnOrder &&
                  Array.isArray(gameData.turnOrder) &&
                  gameData.turnOrder.length > 0 &&
                  (typeof gameData.currentTurn !== "number")
              ) {
                  // Show turn order
                  const orderHtml = gameData.turnOrder.map((entry, idx) =>
                      `<div>${idx + 1}. ${entry.name} (Roll: ${entry.roll})</div>`
                  ).join("");
                  turnOrderDiv.innerHTML = `<div>Turn Order:</div>${orderHtml}`;
              } else {
                  turnOrderDiv.innerHTML = "";
              }
          }
      } else {
          if (playersScoresDiv) {
              playersScoresDiv.innerHTML = "<span>No players found.</span>";
          }
          if (turnOrderDiv) turnOrderDiv.innerHTML = "";
          if (startGameBtn) startGameBtn.style.display = "none";
          console.error("DEBUG: No players found or #players-scores missing");
      }
    });
}

// --- START GAME BUTTON CLICK HANDLER ---
if (startGameBtn) {
    startGameBtn.addEventListener("click", async () => {
        // Get current game code and reference
        const gameCode = currentGameCode;
        if (!gameCode) return;
        const gameRef = doc(db, "games", gameCode);

        // Get latest game data
        const gameSnap = await getDoc(gameRef);
        if (!gameSnap.exists()) return;
        const gameData = gameSnap.data();

        // Roll 2d6 for each player (with dev override support for first player only)
        const turnOrder = gameData.players.map((player, index) => {
            let roll;
            if (index === 0 && isDevEnvironment()) {
                // Allow dev override for first player (usually the host)
                const diceResult = getTurnOrderDiceRoll();
                roll = diceResult.total;
            } else {
                // Random roll for other players or non-dev environment
                roll = Math.floor(Math.random() * 6 + 1) + Math.floor(Math.random() * 6 + 1);
            }
            return {
                uid: player.uid,
                name: player.name || player.email || "Player",
                roll
            };
        }).sort((a, b) => b.roll - a.roll);

        // Update game state with turn order
        await updateDoc(gameRef, {
            turnOrder: turnOrder
        });
        // UI will update on next snapshot
    });
}

onAuthStateChanged(auth, (user) => {
  // FIXME: Skip login page on localhost by injecting a dev user (UI handler)
  if (!user && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    user = {
      uid: "dev-local-uid",
      displayName: "Dev User",
      email: "dev@localhost",
    };
    console.log("DEBUG: Injected dev user for localhost (UI handler):", user);
  }
  if (user) {
    loginBtn.style.display = "none";
    userInfoDiv.style.display = "block";
    userNameP.textContent = `Logged in as: ${user.displayName || user.email}`;
    createGameBtn.style.display = "inline-block";
    joinGameBtn.style.display = "inline-block";
    // Show game code if it exists in localStorage
    const storedCode = localStorage.getItem("currentGameCode");
    if (storedCode) {
      currentGameCode = storedCode;
      gameCodeHeader.textContent = `Current Game Code: ${currentGameCode}`;
      gameCodeHeader.style.display = "block";
    } else {
      gameCodeHeader.textContent = "";
      gameCodeHeader.style.display = "none";
    }
  } else {
    loginBtn.style.display = "inline-block";
    userInfoDiv.style.display = "none";
    userNameP.textContent = "";
    createGameBtn.style.display = "none";
    joinGameBtn.style.display = "none";
    // Hide game code header
    gameCodeHeader.textContent = "";
    gameCodeHeader.style.display = "none";
    // Optionally clear currentGameCode
    currentGameCode = null;
    localStorage.removeItem("currentGameCode");
  }
});

// --- New Game Creation Logic ---

function generateGameCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function getUniqueGameCode() {
  let code, docSnap;
  do {
    code = generateGameCode();
    const docRef = doc(db, "games", code);
    docSnap = await getDoc(docRef);
  } while (docSnap.exists());
  return code;
}

createGameBtn.addEventListener("click", async () => {
  try {
    // Get current user
    let user = auth.currentUser;

    // FIXME: DEV ONLY - Allow local devs to use a fake UID for testing on localhost
    if (!user && (location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      const devUID = getDevUID();
      if (devUID) {
        user = { uid: devUID, isDev: true }; // Mark as dev user for debugging if needed
      }
    }

    if (!user) {
      alert("You must be logged in to create a game.");
      return;
    }

    // Delete all previous games created by this user
    const gamesRef = collection(db, "games");
    const q = query(gamesRef, where("createdBy", "==", user.uid));
    const querySnapshot = await getDocs(q);
    for (const docSnap of querySnapshot.docs) {
      await deleteDoc(doc(db, "games", docSnap.id));
    }

    // Generate unique code
    const code = await getUniqueGameCode();

    // Create new game in Firestore, including user info
    console.log("DEBUG: createGame function called"); // FIXME: Remove after debugging
    const gameData = {
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
      createdByName: user.displayName || user.email || "",
      players: [{
        uid: user.uid,
        name: user.displayName || user.email || "Host",
        email: user.email || "",
        isHost: true,
        ready: false,
        position: 0, // Host starts at position 0
        progress: [false, false, false, false, false, false]
      }],
      currentTurn: 0, // Host is the first player
      // Add other initial game fields as needed
    };
    await setDoc(doc(db, "games", code), gameData);
    console.log("Game created. Players array:", gameData.players);

    // Update header with new code
    currentGameCode = code;
    localStorage.setItem("currentGameCode", code);
    gameCodeHeader.textContent = `Current Game Code: ${code}`;
    gameCodeHeader.style.display = "block";
    // After create, show game page
    document.querySelector(".container").style.display = "none";
    gamePage.style.display = "block";
    await showGamePage(code);
  } catch (error) {
    alert("Failed to create game: " + error.message);
  }
});