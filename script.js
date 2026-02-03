const micButton = document.getElementById("mic-btn");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const assistantEl = document.getElementById("assistant");
const loginStatusEl = document.getElementById("login-status");
const meterFill = document.getElementById("meter-fill");
const meterLabel = document.getElementById("meter-label");
const limitNote = document.getElementById("limit-note");
const sellButton = document.getElementById("sell-btn");
const cancelButton = document.getElementById("cancel-btn");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const supportsSpeech = Boolean(SpeechRecognition);

const state = {
  isListening: false,
  isLoggedIn: Boolean(localStorage.getItem("vj_logged_in")),
  awaitingAnswer: false,
  currentQuestion: "",
  entries: JSON.parse(localStorage.getItem("vj_entries") || "[]"),
  maxEntries: 6,
  credits: Number(localStorage.getItem("vj_credits") || 0)
};

const questionMap = [
  { match: ["work", "office", "project", "meeting"], question: "How did that work moment make you feel?" },
  { match: ["food", "eat", "lunch", "dinner", "breakfast"], question: "Was the meal healthy or did you crave it?" },
  { match: ["travel", "drive", "bus", "train", "flight"], question: "Was the travel smooth or stressful?" },
  { match: ["health", "sick", "doctor", "exercise"], question: "Do you want to track this health moment?" },
  { match: ["family", "friend", "call", "visit"], question: "What stood out in that conversation?" }
];

const greetMessages = [
  "Welcome back. Tell me about your day.",
  "I'm here to listen. What happened today?",
  "Let's capture your day. Start speaking."
];

const speechQueue = [];
let recognition;

const speak = (text) => {
  assistantEl.textContent = text;
  if (!("speechSynthesis" in window)) {
    return;
  }
  speechQueue.push(text);
  if (speechQueue.length === 1) {
    playSpeechQueue();
  }
};

const playSpeechQueue = () => {
  if (speechQueue.length === 0) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(speechQueue[0]);
  utterance.onend = () => {
    speechQueue.shift();
    playSpeechQueue();
  };
  window.speechSynthesis.speak(utterance);
};

const updateLoginStatus = () => {
  if (state.isLoggedIn) {
    loginStatusEl.textContent = "Logged in. Dashboard stays open.";
  } else {
    loginStatusEl.textContent = "One-time voice login required. Say: 'Login me' or tell your name.";
  }
};

const updateLog = () => {
  if (state.entries.length === 0) {
    logEl.textContent = "No entries yet. Tap the mic to begin.";
    return;
  }
  logEl.innerHTML = state.entries
    .map((entry) => `<div><strong>${entry.type}:</strong> ${entry.text}</div>`)
    .join("");
};

const getOfferForEntries = () => {
  const combinedText = state.entries.map((entry) => entry.text).join(" ");
  const wordCount = combinedText.split(/\s+/).filter(Boolean).length;
  const richness = questionMap.reduce(
    (count, rule) => count + rule.match.some((term) => combinedText.toLowerCase().includes(term)),
    0
  );

  if (wordCount < 20) {
    return { amount: 5, label: "Basic" };
  }
  if (wordCount < 60 || richness < 2) {
    return { amount: 10, label: "Detailed" };
  }
  return { amount: 20, label: "High-value" };
};

const updateMeter = () => {
  const offer = state.entries.length === 0 ? { amount: 0, label: "No data yet" } : getOfferForEntries();
  const fillPercent = Math.min((state.entries.length / state.maxEntries) * 100, 100);
  meterFill.style.width = `${fillPercent}%`;
  meterLabel.textContent = offer.amount === 0 ? "₹0 offer" : `₹${offer.amount} offer · ${offer.label}`;
  limitNote.textContent = fillPercent >= 100
    ? "Daily data limit reached. Further sharing will require a charge."
    : "We only accept a limited amount of data per day.";
};

const storeEntry = (text, type = "You") => {
  state.entries.push({ text, type, time: new Date().toISOString() });
  localStorage.setItem("vj_entries", JSON.stringify(state.entries));
  updateLog();
  updateMeter();
};

const decideNextQuestion = (text) => {
  const lowered = text.toLowerCase();
  const matched = questionMap.find((rule) => rule.match.some((term) => lowered.includes(term)));
  if (matched) {
    return matched.question;
  }
  return "Thanks for sharing. Want to add anything else from today?";
};

const handleSpeechResult = (text) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }
  if (!state.isLoggedIn) {
    state.isLoggedIn = true;
    localStorage.setItem("vj_logged_in", "true");
    updateLoginStatus();
    speak(`Login complete. Welcome. ${greetMessages[Math.floor(Math.random() * greetMessages.length)]}`);
    storeEntry(trimmed, "Login");
    return;
  }

  if (state.awaitingAnswer) {
    storeEntry(trimmed, "Answer");
    state.awaitingAnswer = false;
    state.currentQuestion = "";
    speak("Got it. Anything else you'd like to say?");
    return;
  }

  storeEntry(trimmed, "Entry");
  if (state.entries.length >= state.maxEntries) {
    speak("You've reached the daily data limit. You can sell this data or stop for now.");
    return;
  }

  const followUp = decideNextQuestion(trimmed);
  state.awaitingAnswer = true;
  state.currentQuestion = followUp;
  speak(followUp);
};

const startListening = () => {
  if (!supportsSpeech) {
    statusEl.textContent = "Speech recognition is not supported in this browser.";
    return;
  }
  if (state.isListening) {
    return;
  }
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "und";
  recognition.onstart = () => {
    state.isListening = true;
    micButton.classList.add("listening");
    statusEl.textContent = "Listening...";
  };
  recognition.onresult = (event) => {
    const result = event.results[0][0].transcript;
    statusEl.textContent = `Heard: "${result}"`;
    handleSpeechResult(result);
  };
  recognition.onend = () => {
    state.isListening = false;
    micButton.classList.remove("listening");
    statusEl.textContent = "Tap the mic when you want to speak.";
  };
  recognition.onerror = () => {
    state.isListening = false;
    micButton.classList.remove("listening");
    statusEl.textContent = "Couldn't capture audio. Try again.";
  };
  recognition.start();
};

const handleSell = () => {
  if (state.entries.length === 0) {
    speak("There's no data to sell yet.");
    return;
  }
  const offer = getOfferForEntries();
  state.credits += offer.amount;
  localStorage.setItem("vj_credits", String(state.credits));
  speak(`Thanks. ₹${offer.amount} credited. Your balance is ₹${state.credits}. You can withdraw anytime.`);
  state.entries = [];
  localStorage.setItem("vj_entries", JSON.stringify(state.entries));
  updateLog();
  updateMeter();
};

const handleCancel = () => {
  speak("Okay, we won't use this data. You can keep journaling or stop anytime.");
};

micButton.addEventListener("click", startListening);
sellButton.addEventListener("click", handleSell);
cancelButton.addEventListener("click", handleCancel);

document.addEventListener("keydown", (event) => {
  event.preventDefault();
});

updateLoginStatus();
updateLog();
updateMeter();
if (supportsSpeech) {
  speak(greetMessages[0]);
} else {
  assistantEl.textContent = "Speech recognition is not supported in this browser.";
}
