(function () {
  "use strict";

  const gateScreen = document.getElementById("gateScreen");
  const gateStatus = document.getElementById("gateStatus");
  const gateTypeForm = document.getElementById("gateTypeForm");
  const gateTypeInput = document.getElementById("gateTypeInput");
  const gateError = document.getElementById("gateError");
  const gateMicIcon = document.getElementById("gateMicIcon");

  const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  // Indian-English (and other English) accents are recognised better with the
  // visitor's own locale than with a hard-coded en-US.
  const REC_LANG = /^en/i.test(navigator.language || "") ? navigator.language : "en-US";

  const UA = navigator.userAgent;
  const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/i.test(UA) && navigator.maxTouchPoints > 1);
  const IS_SAFARI = IS_IOS || /^((?!chrome|chromium|crios|fxios|edg|opr|android).)*safari/i.test(UA);
  // Safari/iPhone only let the mic start from a tap: no quiet auto-restart there.
  const NEEDS_TAP = IS_SAFARI;

  let recognition = null;
  let wanted = false;     // the visitor wants us listening
  let passed = false;
  let networkErrors = 0;
  let restartTimer = null;

  function micOff() { gateMicIcon.classList.remove("is-listening"); }

  function passGate(transcript, viaVoice) {
    if (passed) return; // guard against double entry (voice result + stray click)
    passed = true;
    wanted = false;
    clearTimeout(restartTimer);
    if (recognition) { try { recognition.abort(); } catch (e) { /* already stopped */ } }
    micOff();
    window.unlockApp(transcript || "", !!viaVoice);
  }

  function startRecognition() {
    if (!recognition || passed || !wanted) return;
    try {
      recognition.start();
      gateMicIcon.classList.add("is-listening");
    } catch (e) {
      restartTimer = setTimeout(startRecognition, 300);
    }
  }

  function beginListening() {
    if (!SpeechRecognitionCtor || wanted || passed) return;
    wanted = true;
    gateError.hidden = true;

    recognition = new SpeechRecognitionCtor();
    recognition.lang = REC_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    gateStatus.textContent = "Listening for \u201cHey MINIme\u201d\u2026";

    recognition.onresult = (event) => {
      networkErrors = 0;
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      if (!result.isFinal) {
        gateStatus.textContent = "\u201c" + text + "\u201d";
        return;
      }
      passGate(text, true);
    };

    recognition.onerror = (event) => {
      const err = event.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        wanted = false;
        micOff();
        gateError.hidden = false;
        gateError.textContent = IS_SAFARI
          ? "Safari needs permission: allow the microphone for this site and turn on Dictation (System Settings \u2192 Keyboard). You can also just type below."
          : "Microphone permission was denied \u2014 click the lock icon in the address bar to allow it, or type below.";
        gateStatus.textContent = "Type instead";
      } else if (err === "audio-capture") {
        wanted = false;
        micOff();
        gateStatus.textContent = "No microphone found \u2014 type below to continue.";
      } else if (err === "network") {
        networkErrors++;
        gateStatus.textContent = "The browser's speech service isn't reachable (Brave and some privacy settings block it) \u2014 type below, or try Chrome, Edge or Safari.";
        if (networkErrors >= 3) { wanted = false; micOff(); }
      }
      // "no-speech" / "aborted": onend fires next.
    };

    recognition.onend = () => {
      if (wanted && !passed) {
        if (NEEDS_TAP) {
          // Safari/iPhone can't reopen the mic without another tap.
          wanted = false;
          micOff();
          gateStatus.textContent = "Didn't catch that \u2014 tap anywhere and say \u201cHey MINIme\u201d";
          return;
        }
        // The browser closes the mic after a few quiet seconds. Quietly
        // reopen it so the visitor never has to tap twice.
        restartTimer = setTimeout(startRecognition, 250);
      } else {
        micOff();
      }
    };

    startRecognition();
  }

  if (!SpeechRecognitionCtor) {
    gateStatus.textContent = "Voice isn't supported in this browser \u2014 type below to continue.";
  }

  // First tap ANYWHERE on the gate starts listening. The tap is also exactly
  // what browsers require before they allow microphone access (and, on
  // Safari/iPhone, before they allow speech output).
  gateScreen.addEventListener("click", (e) => {
    if (gateTypeForm.contains(e.target)) return;
    beginListening();
  });

  gateTypeForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const value = gateTypeInput.value;
    gateTypeInput.value = "";
    if (value.trim()) passGate(value, false);
  });
})();