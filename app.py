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
    If Gemini is not available, returns basic structures with blank details immediately.
    """
    data = request.get_json() or {}
    raw_words = data.get("words", [])
    
    # Simple clean up of input words (strip whitespace and filter empty)
    words = [w.strip().lower() for w in raw_words if w.strip()]
    
    if not words:
        return jsonify({"words": []}), 400

    # Fallback response if Gemini is not configured
    if not client:
        logging.info("Gemini not configured. Returning basic fallback details.")
        fallback_data = []
        for word in words:
            fallback_data.append({
                "word": word,
                "translation": "",
                "definition": "Pistas no disponibles (Modo Básico).",
                "sentence_blank": f"How do you spell '_____'? Check your spelling!",
                "sentence_full": f"How do you spell '{word}'? Check your spelling!"
            })
        return jsonify({"words": fallback_data})

    try:
        # Prompt Gemini to enrich the word list
        words_str = ", ".join(words)
        prompt = (
            f"Please enrich this list of English spelling words for a 10-year-old child: {words_str}.\n"
            "For each word, provide: the word itself, a simple Spanish translation, a friendly English definition, "
            "and a sample sentence with the word blanked out as '_____' as well as the full sentence."
        )

        response = client.models.generate_content(
            model='gemini-3.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=EnrichedWordList,
                temperature=0.2
            ),
        )

        # The SDK returns structured JSON matching our EnrichedWordList schema.
        # We load response.text directly as it is guaranteed to match our schema structure.
        import json
        enriched_result = json.loads(response.text)
        return jsonify(enriched_result)

    except Exception as e:
        logging.error(f"Error enriching words with Gemini: {e}")
        # Fallback to basic mode in case of API error
        fallback_data = []
        for word in words:
            fallback_data.append({
                "word": word,
                "translation": "",
                "definition": "Error al contactar con Gemini. Usando pistas básicas.",
                "sentence_blank": f"Spell the word: '_____'",
                "sentence_full": f"Spell the word: '{word}'"
            })
        return jsonify({"words": fallback_data})


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

        response = client.models.generate_content(
            model='gemini-3.5-flash',
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
