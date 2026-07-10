// --------------------------------------------------
// SPELLING BEE COACH - CLIENT SIDE APPLICATION LOGIC
// --------------------------------------------------

// Default spelling list for 10-year-old
const DEFAULT_WORD_LIST = "beautiful, science, environment, language, experience, library, knowledge, sequence, giraffe, dolphin, balance, challenge, character, special, separate";

// App State
let state = {
    words: [],           // Active enriched words
    currentIndex: 0,     // Current word index
    score: 0,            // First-try correct spelling score
    attempts: 0,         // Attempts for current word
    correctOnCurrentWord: false,
    stats: {
        completedLists: 0,
        starsCount: 0
    }
};

// UI Elements
const els = {
    wordListInput: document.getElementById('wordListInput'),
    btnLoadWords: document.getElementById('btnLoadWords'),
    btnResetWords: document.getElementById('btnResetWords'),
    statCompletedLists: document.getElementById('statCompletedLists'),
    statStarsCount: document.getElementById('statStarsCount'),
    
    // States panels
    gameWelcomeState: document.getElementById('gameWelcomeState'),
    gamePlayState: document.getElementById('gamePlayState'),
    gameFinishedState: document.getElementById('gameFinishedState'),
    
    // HUD
    currentWordNum: document.getElementById('currentWordNum'),
    totalWordsNum: document.getElementById('totalWordsNum'),
    starRating: document.getElementById('starRating'),
    
    // Card & Hints
    spellingCard: document.getElementById('spellingCard'),
    btnPronounceWord: document.getElementById('btnPronounceWord'),
    
    btnRevealTranslation: document.getElementById('btnRevealTranslation'),
    hintTranslationText: document.getElementById('hintTranslationText'),
    hintTranslationItem: document.getElementById('hintTranslationItem'),
    
    btnRevealDefinition: document.getElementById('btnRevealDefinition'),
    hintDefinitionText: document.getElementById('hintDefinitionText'),
    hintDefinitionItem: document.getElementById('hintDefinitionItem'),
    
    btnRevealSentence: document.getElementById('btnRevealSentence'),
    hintSentenceText: document.getElementById('hintSentenceText'),
    hintSentenceItem: document.getElementById('hintSentenceItem'),
    
    // Inputs
    feedbackInputBox: document.getElementById('feedbackInputBox'),
    feedbackPlaceholder: document.getElementById('feedbackPlaceholder'),
    typedLettersRow: document.getElementById('typedLettersRow'),
    manualSpellingInput: document.getElementById('manualSpellingInput'),
    btnMicInput: document.getElementById('btnMicInput'),
    micStatusText: document.getElementById('micStatusText'),
    
    // Actions
    btnSkipWord: document.getElementById('btnSkipWord'),
    btnCheckSpelling: document.getElementById('btnCheckSpelling'),
    
    // Tutor
    tutorBox: document.getElementById('tutorBox'),
    tutorText: document.getElementById('tutorText'),
    
    // Finished state
    finishedStars: document.getElementById('finishedStars'),
    finishedScoreText: document.getElementById('finishedScoreText'),
    btnRestartPractice: document.getElementById('btnRestartPractice')
};

// Letter mapping for voice spelling (handles common English letter homophones)
const VOICE_LETTER_MAP = {
    'a': 'a', 'ay': 'a', 'eight': 'a',
    'bee': 'b', 'be': 'b', 'b': 'b',
    'see': 'c', 'sea': 'c', 'c': 'c',
    'dee': 'd', 'd': 'd',
    'e': 'e', 'ee': 'e',
    'ef': 'f', 'f': 'f',
    'gee': 'g', 'g': 'g',
    'aitch': 'h', 'h': 'h', 'edge': 'h',
    'i': 'i', 'eye': 'i',
    'jay': 'j', 'j': 'j',
    'kay': 'k', 'k': 'k',
    'el': 'l', 'l': 'l',
    'em': 'm', 'm': 'm',
    'en': 'n', 'n': 'n',
    'o': 'o', 'oh': 'o', 'owe': 'o',
    'pee': 'p', 'p': 'p',
    'cue': 'q', 'queue': 'q', 'q': 'q',
    'are': 'r', 'our': 'r', 'r': 'r',
    'ess': 's', 'es': 's', 's': 's',
    'tee': 't', 'tea': 't', 't': 't',
    'u': 'u', 'you': 'u',
    'vee': 'v', 'v': 'v',
    'double-u': 'w', 'double u': 'w', 'w': 'w',
    'ex': 'x', 'x': 'x',
    'why': 'y', 'y': 'y',
    'zee': 'z', 'zed': 'z', 'z': 'z'
};

// --------------------------------------------------
// SOUND SYNTHESIS USING WEB AUDIO API
// --------------------------------------------------
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;
    
    if (type === 'correct') {
        // Upbeat chime "ding-ding!"
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        
        // Second note
        setTimeout(() => {
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
            gain2.gain.setValueAtTime(0.15, now + 0.12);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
            osc2.start(now + 0.12);
            osc2.stop(now + 0.35);
        }, 120);
        
    } else if (type === 'incorrect') {
        // Low frequency "buzz/boing"
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.25);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
    }
}

// --------------------------------------------------
// SPEECH SYNTHESIS (PRONUNCIATION)
// --------------------------------------------------
function speak(text, rate = 0.9) {
    if (!text) return;
    
    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Search for an English voice
    const voices = window.speechSynthesis.getVoices();
    let englishVoice = voices.find(voice => voice.lang.startsWith('en-US'));
    if (!englishVoice) {
        englishVoice = voices.find(voice => voice.lang.startsWith('en'));
    }
    
    if (englishVoice) {
        utterance.voice = englishVoice;
    }
    
    utterance.lang = 'en-US';
    utterance.rate = rate; // slightly slower for clarity
    
    window.speechSynthesis.speak(utterance);
}

// Ensure voices are loaded (Chrome lazy-loads them)
if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => speak(''); 
}

// --------------------------------------------------
// SPEECH RECOGNITION (VOICE INPUT)
// --------------------------------------------------
let recognition = null;
let isListening = false;
let hasSpeechError = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => {
        isListening = true;
        hasSpeechError = false;
        els.btnMicInput.classList.add('listening');
        els.micStatusText.textContent = "Escuchando... ¡Deletrea!";
    };
    
    recognition.onend = () => {
        isListening = false;
        els.btnMicInput.classList.remove('listening');
        
        // Reset to default button text ONLY if there was no error
        if (!hasSpeechError) {
            els.micStatusText.textContent = "Presiona para deletrear";
        } else {
            // Keep the error text visible for 5 seconds, then restore default text
            setTimeout(() => {
                if (!isListening && hasSpeechError) {
                    els.micStatusText.textContent = "Presiona para deletrear";
                    hasSpeechError = false;
                }
            }, 5000);
        }
    };
    
    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        hasSpeechError = true;
        
        let errorMsg = "⚠️ Error al escuchar. Reintenta.";
        
        if (event.error === 'not-allowed') {
            // Check if context is insecure HTTP on non-localhost
            if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                errorMsg = "⚠️ El micrófono requiere HTTPS.";
                alert("Bloqueo de Seguridad del Navegador:\n\nEl deletreo por voz requiere una conexión segura (HTTPS) para funcionar. \n\nPara probarlo en tu red local en otro dispositivo, debes desplegarlo en Railway (que incluye HTTPS gratis) o acceder directamente desde la computadora del servidor usando 'localhost:5000'.");
            } else {
                errorMsg = "⚠️ Permiso de micrófono denegado.";
                alert("Acceso denegado al micrófono:\n\nPor favor, haz clic en el icono de candado/cámara en la barra de direcciones de tu navegador y permite el uso del micrófono para esta página.");
            }
        } else if (event.error === 'network') {
            errorMsg = "⚠️ Error de red en voz Chrome.";
            alert("Error de Red de Voz ('network'):\n\nEl navegador Chrome envía el audio a los servidores de Google para traducirlo a texto. Este error ocurre cuando:\n\n1. Tu computadora no tiene una conexión estable a Internet.\n2. Chrome no tiene permisos de Grabación de Audio a nivel de tu Sistema Operativo (Mac).\n   -> Ve a 'Ajustes del Sistema > Privacidad y seguridad > Micrófono' y asegúrate de que 'Google Chrome' esté activado.\n3. Algún bloqueador de publicidad o cortafuegos está interfiriendo con los servidores de Google.");
        } else if (event.error === 'no-speech') {
            errorMsg = "⚠️ No se detectó voz. ¡Habla claro!";
        } else if (event.error === 'audio-capture') {
            errorMsg = "⚠️ No se encontró micrófono.";
        }
        
        els.micStatusText.textContent = errorMsg;
    };
    
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        console.log("Raw Voice transcript:", transcript);
        processVoiceSpelling(transcript);
    };
} else {
    // Disable mic option if not supported
    els.btnMicInput.style.display = 'none';
    const hint = document.querySelector('.mic-hint');
    if (hint) hint.textContent = "El deletreo por voz no es compatible con este navegador. ¡Usa el teclado!";
}

// Convert voice transcripts to actual spelling letters
function processVoiceSpelling(transcript) {
    // 1. Remove commas, dashes, periods
    const cleanTranscript = transcript.toLowerCase().replace(/[-.,]/g, ' ').trim();
    const spokenTokens = cleanTranscript.split(/\s+/);
    
    let spelledWord = "";
    
    // If the transcript is just a single word and matches the target word length roughly,
    // they might have pronounced the whole word instead of spelling it.
    // However, if they spelled it, spokenTokens will contain multiple isolated letters or letters translated to words (e.g. "c a t" or "see a tea")
    
    if (spokenTokens.length === 1) {
        // Child spoke a single full word
        spelledWord = spokenTokens[0];
    } else {
        // Child spelled letter by letter
        for (const token of spokenTokens) {
            if (VOICE_LETTER_MAP[token]) {
                spelledWord += VOICE_LETTER_MAP[token];
            } else if (token.length === 1) {
                // If it's a single character letter itself
                spelledWord += token;
            } else {
                // Keep the token if it doesn't match, maybe they pronounced it clearly
                spelledWord += token;
            }
        }
    }
    
    // Clean spaces from spelledWord
    spelledWord = spelledWord.replace(/\s+/g, '');
    
    // Update input boxes
    els.manualSpellingInput.value = spelledWord;
    updateVisualLetterBubbles(spelledWord);
}

// Update the bubble letter layout in real time
function updateVisualLetterBubbles(wordText) {
    els.typedLettersRow.innerHTML = '';
    
    if (wordText.length > 0) {
        els.feedbackPlaceholder.classList.add('hidden');
        
        for (const char of wordText) {
            const bubble = document.createElement('span');
            bubble.className = 'letter-bubble';
            bubble.textContent = char.toUpperCase();
            els.typedLettersRow.appendChild(bubble);
        }
    } else {
        els.feedbackPlaceholder.classList.remove('hidden');
    }
}

// --------------------------------------------------
// ACCORDION / HINTS DISCOVERY
// --------------------------------------------------
function setupAccordion(headerEl, contentEl, itemEl) {
    headerEl.addEventListener('click', () => {
        const isCurrentlyActive = contentEl.classList.contains('active');
        
        // Toggle active
        if (isCurrentlyActive) {
            contentEl.classList.remove('active');
            itemEl.classList.remove('expanded');
        } else {
            contentEl.classList.add('active');
            itemEl.classList.add('expanded');
            
            // If revealing sentence, speak the sentence aloud (for auditory reinforcement)
            if (contentEl.id === 'hintSentenceText') {
                const activeWord = state.words[state.currentIndex];
                if (activeWord && activeWord.sentence_full) {
                    // Say the full sentence, but mask the word in our minds or read it normally
                    speak(activeWord.sentence_full, 0.85);
                }
            }
        }
    });
}

// --------------------------------------------------
// CORE SPELLING BEE ENGINE
// --------------------------------------------------

// Start active session
function startPractice() {
    state.currentIndex = 0;
    state.score = 0;
    
    els.gameWelcomeState.classList.remove('active');
    els.gameFinishedState.classList.remove('active');
    els.gamePlayState.classList.add('active');
    
    loadWord(0);
}

// Load word details onto the card
function loadWord(index) {
    if (index >= state.words.length) {
        finishPractice();
        return;
    }
    
    state.currentIndex = index;
    state.attempts = 0;
    state.correctOnCurrentWord = false;
    
    const wordObj = state.words[index];
    
    // Update HUD
    els.currentWordNum.textContent = index + 1;
    els.totalWordsNum.textContent = state.words.length;
    els.starRating.textContent = "⭐".repeat(Math.max(1, 5 - state.attempts));
    
    // Reset inputs
    els.manualSpellingInput.value = "";
    els.manualSpellingInput.disabled = false;
    updateVisualLetterBubbles("");
    
    // Reset hints & collapse accordion
    els.hintTranslationText.textContent = wordObj.translation || "No disponible (deletrea la palabra directamente).";
    els.hintDefinitionText.textContent = wordObj.definition || "Definition not available.";
    els.hintSentenceText.textContent = wordObj.sentence_blank || `Sentence: Spell the word '${wordObj.word}'`;
    
    // Hide active tabs
    els.hintTranslationText.classList.remove('active');
    els.hintTranslationItem.classList.remove('expanded');
    els.hintDefinitionText.classList.remove('active');
    els.hintDefinitionItem.classList.remove('expanded');
    els.hintSentenceText.classList.remove('active');
    els.hintSentenceItem.classList.remove('expanded');
    
    // Hide tutor
    els.tutorBox.style.display = 'none';
    
    // Pronounce the word
    setTimeout(() => {
        pronounceActiveWord();
    }, 400);
}

function pronounceActiveWord() {
    const wordObj = state.words[state.currentIndex];
    if (wordObj) {
        speak(wordObj.word);
    }
}

// Validate Spelled Word
function checkSpelling() {
    if (state.correctOnCurrentWord) return; // already solved
    
    const wordObj = state.words[state.currentIndex];
    if (!wordObj) return;
    
    const childSpelling = els.manualSpellingInput.value.trim().toLowerCase();
    const correctSpelling = wordObj.word.trim().toLowerCase();
    
    if (!childSpelling) {
        alert("¡Escribe o deletrea algo antes de validar!");
        return;
    }
    
    if (childSpelling === correctSpelling) {
        // SUCCESS!
        state.correctOnCurrentWord = true;
        playSound('correct');
        confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.6 }
        });
        
        // Add to score if correct on first attempt
        if (state.attempts === 0) {
            state.score++;
            // Increment total stars
            state.stats.starsCount += 5;
        } else {
            // Earn some stars anyway
            state.stats.starsCount += Math.max(1, 5 - state.attempts);
        }
        saveStats();
        
        // Visual indicator on input
        els.manualSpellingInput.style.borderColor = 'var(--color-success)';
        els.manualSpellingInput.disabled = true;
        
        // Display nice tutor message
        els.tutorBox.style.display = 'flex';
        els.tutorBox.style.borderColor = '#C8E6C9';
        els.tutorBox.style.backgroundColor = '#E8F5E9';
        els.tutorText.innerHTML = `🌟 <strong>¡Excelente!</strong> Deletreaste correctamente <strong>"${wordObj.word}"</strong>.`;
        
        // Delay and load next word
        setTimeout(() => {
            loadWord(state.currentIndex + 1);
        }, 2000);
        
    } else {
        // ERROR!
        state.attempts++;
        playSound('incorrect');
        
        // Shake animation
        els.spellingCard.classList.add('shake-card');
        setTimeout(() => {
            els.spellingCard.classList.remove('shake-card');
        }, 500);
        
        // Visual indicator on input
        els.manualSpellingInput.style.borderColor = 'var(--color-danger)';
        setTimeout(() => {
            els.manualSpellingInput.style.borderColor = 'var(--color-border)';
        }, 1500);
        
        // Update Stars HUD
        els.starRating.textContent = "⭐".repeat(Math.max(1, 5 - state.attempts));
        
        // If they failed 2 times, fetch tutoring explanation from Gemini
        if (state.attempts >= 2) {
            fetchSpellingExplanation(wordObj.word, childSpelling);
        } else {
            // Simple tips
            els.tutorBox.style.display = 'flex';
            els.tutorBox.style.borderColor = '#FFE082';
            els.tutorBox.style.backgroundColor = '#FFFDE7';
            els.tutorText.innerHTML = `⚠️ <strong>¡Casi lo logras!</strong> Escucha con atención e inténtalo de nuevo. Recuerda que puedes revelar pistas arriba.`;
        }
    }
}

// Retrieve custom spelling rules from Gemini API
async function fetchSpellingExplanation(word, attempt) {
    els.tutorBox.style.display = 'flex';
    els.tutorBox.style.borderColor = '#FFF59D';
    els.tutorBox.style.backgroundColor = '#FFFDE7';
    els.tutorText.textContent = "La abeja tutora está pensando un consejo...";
    
    try {
        const response = await fetch('/api/explain-word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: word, attempt: attempt })
        });
        
        if (response.ok) {
            const result = await response.json();
            els.tutorText.innerHTML = `💡 ${result.explanation}`;
        } else {
            throw new Error();
        }
    } catch (e) {
        els.tutorText.innerHTML = `💡 Recuerda repasar la pronunciación de <strong>${word}</strong>. ¡Tú puedes hacerlo!`;
    }
}

// Skip Active Word
function skipWord() {
    loadWord(state.currentIndex + 1);
}

// Complete the whole spelling queue
function finishPractice() {
    els.gamePlayState.classList.remove('active');
    els.gameFinishedState.classList.add('active');
    
    // Complete list stats
    state.stats.completedLists++;
    saveStats();
    
    // Render finished screen
    els.finishedScoreText.textContent = `Aciertos en el primer intento: ${state.score} de ${state.words.length}`;
    
    // Confetti shower
    const duration = 2.5 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1 }
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
    
    // Update star rating in success screen
    let starSymbol = "⭐";
    const percentage = state.score / state.words.length;
    if (percentage >= 0.9) starSymbol = "⭐⭐⭐⭐⭐";
    else if (percentage >= 0.7) starSymbol = "⭐⭐⭐⭐";
    else if (percentage >= 0.5) starSymbol = "⭐⭐⭐";
    else if (percentage >= 0.3) starSymbol = "⭐⭐";
    
    els.finishedStars.textContent = starSymbol;
}

// --------------------------------------------------
// PERSISTENT DATA MANAGEMENT
// --------------------------------------------------
function loadStats() {
    const local = localStorage.getItem('spelling_stats');
    if (local) {
        try {
            state.stats = JSON.parse(local);
            if (!state.stats.completedLists) state.stats.completedLists = 0;
            if (!state.stats.starsCount) state.stats.starsCount = 0;
        } catch(e) {}
    }
    
    els.statCompletedLists.textContent = state.stats.completedLists;
    els.statStarsCount.textContent = `⭐ ${state.stats.starsCount}`;
}

function saveStats() {
    localStorage.setItem('spelling_stats', JSON.stringify(state.stats));
    els.statCompletedLists.textContent = state.stats.completedLists;
    els.statStarsCount.textContent = `⭐ ${state.stats.starsCount}`;
}

// Load inputs from storage or default
function initWordInputs() {
    const savedWords = localStorage.getItem('spelling_custom_words');
    if (savedWords) {
        els.wordListInput.value = savedWords;
    } else {
        els.wordListInput.value = DEFAULT_WORD_LIST;
    }
}

// API request to enrich words list
async function loadAndEnrichWords() {
    const rawInput = els.wordListInput.value;
    // Clean and split words by comma or lines
    const parsedWords = rawInput
        .split(/[,\n]/)
        .map(w => w.replace(/[^a-zA-Z]/g, '').trim()) // letters only
        .filter(w => w.length > 0);
        
    if (parsedWords.length === 0) {
        alert("Escribe al menos una palabra para practicar.");
        return;
    }
    
    // Save raw text list
    localStorage.setItem('spelling_custom_words', rawInput);
    
    els.btnLoadWords.disabled = true;
    els.btnLoadWords.textContent = "⏳ Cargando pistas...";
    
    try {
        const response = await fetch('/api/enrich-words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words: parsedWords })
        });
        
        if (response.ok) {
            const data = await response.json();
            state.words = data.words || [];
            startPractice();
        } else {
            throw new Error();
        }
    } catch(e) {
        console.error("Enrichment API error, running in basic mode.", e);
        // Basic Fallback if Server fails
        state.words = parsedWords.map(word => {
            return {
                word: word,
                translation: "",
                definition: "Modo básico (sin conexión o Gemini inactivo).",
                sentence_blank: `Spell the word: '_____'`,
                sentence_full: `Spell the word: '${word}'`
            };
        });
        startPractice();
    } finally {
        els.btnLoadWords.disabled = false;
        els.btnLoadWords.textContent = "🚀 Comenzar Práctica";
    }
}

// --------------------------------------------------
// INITIALIZATION & EVENT LISTENERS
// --------------------------------------------------

// Register events
els.btnLoadWords.addEventListener('click', loadAndEnrichWords);

els.btnResetWords.addEventListener('click', () => {
    if (confirm("¿Estás seguro de que quieres restaurar la lista por defecto?")) {
        els.wordListInput.value = DEFAULT_WORD_LIST;
        localStorage.setItem('spelling_custom_words', DEFAULT_WORD_LIST);
        loadAndEnrichWords();
    }
});

els.btnPronounceWord.addEventListener('click', pronounceActiveWord);

els.btnCheckSpelling.addEventListener('click', checkSpelling);
els.btnSkipWord.addEventListener('click', skipWord);

els.btnRestartPractice.addEventListener('click', startPractice);

// Accordion setups
setupAccordion(els.btnRevealTranslation, els.hintTranslationText, els.hintTranslationItem);
setupAccordion(els.btnRevealDefinition, els.hintDefinitionText, els.hintDefinitionItem);
setupAccordion(els.btnRevealSentence, els.hintSentenceText, els.hintSentenceItem);

// Mic control listener
if (recognition) {
    els.btnMicInput.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
        } else {
            // Activate mic
            recognition.start();
        }
    });
}

// Manual Text input character bubble builder
els.manualSpellingInput.addEventListener('input', (e) => {
    // Keep it lowercase and filter non-alphabet characters
    let value = e.target.value.toLowerCase().replace(/[^a-z]/g, '');
    e.target.value = value;
    updateVisualLetterBubbles(value);
});

// Enable Enter key validation
els.manualSpellingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        checkSpelling();
    }
});

// Boot application
loadStats();
initWordInputs();
