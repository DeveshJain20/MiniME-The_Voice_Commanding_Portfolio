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

  let recognition = null;
  let wanted = false;     // the visitor wants us listening
  let passed = false;
  let networkErrors = 0;
  let restartTimer = null;

  function passGate(transcript, viaVoice) {
    if (passed) return; // guard against double entry (voice result + stray click)
    passed = true;
    wanted = false;
    clearTimeout(restartTimer);
    if (recognition) { try { recognition.abort(); } catch (e) { /* already stopped */ } }
    gateMicIcon.classList.remove("is-listening");
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
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        wanted = false;
        gateMicIcon.classList.remove("is-listening");
        gateError.hidden = false;
        gateError.textContent = "Microphone permission was denied \u2014 you can still type below.";
        gateStatus.textContent = "Type instead";
      } else if (event.error === "network") {
        networkErrors++;
        if (networkErrors >= 3) {
          wanted = false;
          gateMicIcon.classList.remove("is-listening");
          gateStatus.textContent = "Voice service unreachable \u2014 type below to continue.";
        }
      }
      // "no-speech" / "aborted": onend fires next and we simply listen again.
    };

    recognition.onend = () => {
      if (wanted && !passed) {
        // The browser closes the mic after a few quiet seconds. Quietly
        // reopen it so the visitor never has to tap twice.
        restartTimer = setTimeout(startRecognition, 250);
      } else {
        gateMicIcon.classList.remove("is-listening");
      }
    };

    startRecognition();
  }

  if (!SpeechRecognitionCtor) {
    gateStatus.textContent = "Voice isn't supported in this browser \u2014 type below to continue.";
  }

  // First tap ANYWHERE on the gate starts listening \u2014 the click also happens
  // to be exactly what satisfies the browser's requirement that microphone
  // access starts from a real user gesture.
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