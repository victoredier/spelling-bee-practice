import os
import logging
from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv

# Load local environment variables from .env if present
load_dotenv()

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Initialize Gemini Client if API Key is available
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
client = None

if GEMINI_API_KEY:
    try:
        from google import genai
        from google.genai import types
        from pydantic import BaseModel, Field

        # Define schema for word enrichment using Pydantic
        class WordDetails(BaseModel):
            word: str = Field(description="The English spelling word in lowercase.")
            translation: str = Field(description="The Spanish translation of the word.")
            definition: str = Field(description="A simple, child-friendly definition in English (for a 10-year-old).")
            sentence_blank: str = Field(description="A simple English example sentence using the word, replacing the target word with '_____'.")
            sentence_full: str = Field(description="The full English example sentence containing the word.")

        class EnrichedWordList(BaseModel):
            words: list[WordDetails]

        # Initialize the GenAI Client
        # GenAI Client automatically reads GEMINI_API_KEY from environment
        client = genai.Client()
        logging.info("Gemini Client successfully initialized.")
    except Exception as e:
        logging.error(f"Error initializing Gemini client: {e}")
        client = None
else:
    logging.warning("GEMINI_API_KEY not found. App will run in fallback (offline) mode.")

FALLBACK_MODELS = [
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash'
]

def generate_content_with_fallback(contents, config):
    if not client:
        raise RuntimeError("Gemini client is not initialized")
    last_exception = None
    for model_name in FALLBACK_MODELS:
        try:
            return client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config
            )
        except Exception as e:
            logging.warning(f"Model '{model_name}' failed: {e}. Trying fallback model...")
            last_exception = e
    raise last_exception



# Simple JSON file cache for word enrichments
CACHE_FILE = "word_cache.json"
word_cache = {}

def load_word_cache():
    global word_cache
    if os.path.exists(CACHE_FILE):
        try:
            import json
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                word_cache = json.load(f)
            logging.info(f"Loaded {len(word_cache)} words from cache file.")
        except Exception as e:
            logging.error(f"Error loading cache file: {e}")
            word_cache = {}

def save_word_cache():
    try:
        import json
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(word_cache, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logging.error(f"Error saving cache file: {e}")

# Load cache immediately on startup
load_word_cache()


@app.route("/")
def index():
    # Render the main page.
    # Pass whether Gemini is enabled so the UI can show/hide features or status indicators
    gemini_enabled = client is not None
    return render_template("index.html", gemini_enabled=gemini_enabled)


@app.route("/api/enrich-words", methods=["POST"])
def enrich_words():
    """
    Receives a list of words, cleans them up, and enriches them using Gemini if available.
    Uses a local JSON cache to avoid calling Gemini for already processed words.
    """
    data = request.get_json() or {}
    raw_words = data.get("words", [])
    
    # Simple clean up of input words (strip whitespace and filter empty)
    words = [w.strip().lower() for w in raw_words if w.strip()]
    
    if not words:
        return jsonify({"words": []}), 400

    # Check cache first
    response_words = []
    words_to_fetch = []
    
    for word in words:
        if word in word_cache:
            response_words.append(word_cache[word])
        else:
            words_to_fetch.append(word)

    # If all words are already cached, return immediately
    if not words_to_fetch:
        logging.info("All requested words retrieved from backend cache.")
        # Re-sort to match original input order
        ordered_response = []
        for word in words:
            matched = next((item for item in response_words if item["word"].lower() == word), None)
            if matched:
                ordered_response.append(matched)
        return jsonify({"words": ordered_response})

    # Fallback response for new words if Gemini is not configured
    if not client:
        logging.info("Gemini not configured. Returning basic fallback details for new words.")
        for word in words_to_fetch:
            fallback_item = {
                "word": word,
                "translation": "",
                "definition": "Pistas no disponibles (Modo Básico).",
                "sentence_blank": f"How do you spell '_____'? Check your spelling!",
                "sentence_full": f"How do you spell '{word}'? Check your spelling!"
            }
            response_words.append(fallback_item)
            
        # Re-sort to match original input order
        ordered_response = []
        for word in words:
            matched = next((item for item in response_words if item["word"].lower() == word), None)
            if matched:
                ordered_response.append(matched)
        return jsonify({"words": ordered_response})

    try:
        # Prompt Gemini to enrich ONLY the non-cached words
        words_str = ", ".join(words_to_fetch)
        prompt = (
            f"Please enrich this list of English spelling words for a 10-year-old child: {words_str}.\n"
            "For each word, provide: the word itself, a simple Spanish translation, a friendly English definition, "
            "and a sample sentence with the word blanked out as '_____' as well as the full sentence."
        )

        response = generate_content_with_fallback(
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=EnrichedWordList,
                temperature=0.2
            ),
        )

        import json
        enriched_result = json.loads(response.text)
        new_words = enriched_result.get("words", [])
        
        # Save new words to cache
        for item in new_words:
            w_name = item["word"].strip().lower()
            word_cache[w_name] = item
            response_words.append(item)
            
        save_word_cache()
        logging.info(f"Enriched {len(new_words)} words via Gemini API. Saved to cache.")
        
        # Sort response_words to match original input order
        ordered_response = []
        for word in words:
            matched = next((item for item in response_words if item["word"].lower() == word), None)
            if matched:
                ordered_response.append(matched)
            else:
                # Emergency fallback if Gemini changed spelling slightly
                ordered_response.append({
                    "word": word,
                    "translation": "",
                    "definition": "Detalles no disponibles.",
                    "sentence_blank": f"Spell the word: '_____' (No sentence)",
                    "sentence_full": f"Spell the word: '{word}'"
                })
                
        return jsonify({"words": ordered_response})

    except Exception as e:
        logging.error(f"Error enriching words with Gemini: {e}")
        # Fallback for the non-cached words in case of API error
        for word in words_to_fetch:
            fallback_item = {
                "word": word,
                "translation": "",
                "definition": "Error al contactar con Gemini. Usando pistas básicas.",
                "sentence_blank": f"Spell the word: '_____'",
                "sentence_full": f"Spell the word: '{word}'"
            }
            response_words.append(fallback_item)
            
        # Sort response_words to match original input order
        ordered_response = []
        for word in words:
            matched = next((item for item in response_words if item["word"].lower() == word), None)
            if matched:
                ordered_response.append(matched)
        return jsonify({"words": ordered_response})


@app.route("/api/explain-word", methods=["POST"])
def explain_word():
    """
    Provides a short, friendly spelling tip/explanation (in Spanish) using Gemini
    when a child misspells a word.
    """
    data = request.get_json() or {}
    target_word = data.get("word", "").strip().lower()
    attempt = data.get("attempt", "").strip().lower()

    if not target_word:
        return jsonify({"explanation": "¡No se pudo identificar la palabra!"}), 400

    if not client:
        return jsonify({"explanation": "El Tutor de la Abeja no está disponible sin conexión a internet o sin la API Key."})

    try:
        prompt = (
            f"A 10-year-old child tried to spell the English word '{target_word}' but spelled it as '{attempt}'.\n"
            "Write a very short (max 2 sentences), encouraging tip in Spanish explaining why it is spelled that way "
            "or how they can remember it. Focus on phonetic rules or silent letters if applicable. "
            "Speak directly to the child. Keep it friendly and motivating."
        )

        response = generate_content_with_fallback(
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=150
            )
        )

        explanation = response.text.strip()
        return jsonify({"explanation": explanation})

    except Exception as e:
        logging.error(f"Error generating explanation: {e}")
        return jsonify({"explanation": f"¡Casi lo logras! La palabra correcta se escribe: '{target_word}'. ¡Sigue intentándolo!"})


if __name__ == "__main__":
    # Get port from environment (Railway sets PORT environment variable automatically)
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=os.environ.get("FLASK_ENV") == "development")
