const socket = io();

const connectionBadge = document.querySelector("#connectionBadge");
const nameInput = document.querySelector("#nameInput");
const regionInput = document.querySelector("#regionInput");
const statusText = document.querySelector("#statusText");
const peerText = document.querySelector("#peerText");
const avatar = document.querySelector("#avatar");
const emptyState = document.querySelector("#emptyState");
const levelBar = document.querySelector("#levelBar");
const startBtn = document.querySelector("#startBtn");
const muteBtn = document.querySelector("#muteBtn");
const cameraBtn = document.querySelector("#cameraBtn");
const skipBtn = document.querySelector("#skipBtn");
const stopBtn = document.querySelector("#stopBtn");
const localVideo = document.querySelector("#localVideo");
const remoteVideo = document.querySelector("#remoteVideo");

let localStream;
let peerConnection;
let analyser;
let audioLevelFrame;
let isMuted = false;
let isCameraOff = false;
let currentState = "idle";

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" }
  ]
};

function setStatus(status, peer = "") {
  statusText.textContent = status;
  peerText.textContent = peer;
}

function setControls(state) {
  currentState = state;
  const inCall = state === "matched" || state === "calling";
  const searching = state === "searching";

  startBtn.disabled = searching || inCall;
  muteBtn.disabled = !inCall;
  cameraBtn.disabled = !inCall;
  skipBtn.disabled = !inCall && !searching;
  stopBtn.disabled = !inCall && !searching;
}

function initials(name) {
  return String(name || "Voice Match")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "VM";
}

function sendProfile() {
  socket.emit("profile", {
    name: nameInput.value || "Guest",
    region: regionInput.value || "Somewhere"
  });
}

async function ensureMedia() {
  if (localStream) {
    return localStream;
  }

  localStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: "user"
    }
  });

  localVideo.srcObject = localStream;
  localVideo.classList.add("visible");
  startLevelMeter(localStream);
  return localStream;
}

function startLevelMeter(stream) {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  function tick() {
    analyser.getByteFrequencyData(data);
    const average = data.reduce((sum, value) => sum + value, 0) / data.length;
    levelBar.style.width = `${Math.min(100, Math.round(average * 1.7))}%`;
    audioLevelFrame = requestAnimationFrame(tick);
  }

  tick();
}

function closePeerConnection() {
  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.close();
    peerConnection = null;
  }

  remoteVideo.srcObject = null;
  remoteVideo.classList.remove("visible");
  emptyState.classList.remove("in-call");
}

async function createPeerConnection(role) {
  closePeerConnection();

  peerConnection = new RTCPeerConnection(rtcConfig);
  const stream = await ensureMedia();

  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { type: "candidate", candidate: event.candidate });
    }
  };

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams;
    remoteVideo.srcObject = remoteStream;
    remoteVideo.classList.add("visible");
    emptyState.classList.add("in-call");
  };

  if (role === "caller") {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit("signal", { type: "offer", description: peerConnection.localDescription });
  }
}

async function handleSignal(payload) {
  const data = payload.data;
  if (!peerConnection) {
    await createPeerConnection("callee");
  }

  if (data.type === "offer") {
    await peerConnection.setRemoteDescription(data.description);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.emit("signal", { type: "answer", description: peerConnection.localDescription });
    return;
  }

  if (data.type === "answer") {
    await peerConnection.setRemoteDescription(data.description);
    return;
  }

  if (data.type === "candidate" && data.candidate) {
    await peerConnection.addIceCandidate(data.candidate);
  }
}

async function startSearch() {
  try {
    sendProfile();
    await ensureMedia();
    setStatus("Finding someone...", "Keep this tab open while we match you.");
    setControls("searching");
    socket.emit("find-match");
  } catch (error) {
    setStatus("Camera blocked", "Allow camera and microphone access in your browser to start a video call.");
    setControls("idle");
  }
}

function resetCall(message = "Ready when you are.", detail = "Tap start to meet someone by video.") {
  closePeerConnection();
  setStatus(message, detail);
  avatar.textContent = initials(nameInput.value || "Video Match");
  setControls("idle");
}

startBtn.addEventListener("click", startSearch);

skipBtn.addEventListener("click", () => {
  closePeerConnection();
  setStatus("Finding someone new...", "Searching for another available caller.");
  setControls("searching");
  socket.emit("skip");
});

stopBtn.addEventListener("click", () => {
  socket.emit(currentState === "searching" ? "cancel-search" : "leave-call");
  resetCall();
});

muteBtn.addEventListener("click", () => {
  if (!localStream) {
    return;
  }

  isMuted = !isMuted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !isMuted;
  });
  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
});

cameraBtn.addEventListener("click", () => {
  if (!localStream) {
    return;
  }

  isCameraOff = !isCameraOff;
  localStream.getVideoTracks().forEach((track) => {
    track.enabled = !isCameraOff;
  });
  localVideo.classList.toggle("camera-off", isCameraOff);
  cameraBtn.textContent = isCameraOff ? "Camera On" : "Camera";
});

nameInput.addEventListener("change", sendProfile);
regionInput.addEventListener("change", sendProfile);

socket.on("connect", () => {
  connectionBadge.textContent = "Online";
  connectionBadge.classList.add("online");
  sendProfile();
});

socket.on("disconnect", () => {
  connectionBadge.textContent = "Offline";
  connectionBadge.classList.remove("online");
  resetCall("Disconnected", "We will reconnect when the server is reachable.");
});

socket.on("queued", ({ position }) => {
  setStatus("In the queue", `Your queue position is ${position}.`);
});

socket.on("matched", async ({ role, peer }) => {
  avatar.textContent = initials(peer.name);
  setStatus("Connected", `${peer.name} from ${peer.region}`);
  setControls("matched");
  await createPeerConnection(role);
});

socket.on("signal", (payload) => {
  handleSignal(payload).catch(() => {
    resetCall("Call failed", "The voice connection could not be established.");
  });
});

socket.on("match-ended", ({ reason }) => {
  const detail = reason === "skipped" ? "They skipped the call." : "The other caller left.";
  resetCall("Call ended", detail);
});

socket.on("idle", () => {
  resetCall();
});

window.addEventListener("beforeunload", () => {
  if (audioLevelFrame) {
    cancelAnimationFrame(audioLevelFrame);
  }
});
