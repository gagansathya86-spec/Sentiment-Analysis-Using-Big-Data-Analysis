"""
Text preprocessing pipeline.

Mirrors Section II-B of the paper:
  1. Text cleaning: remove URLs, mentions, special characters, punctuation,
     numbers, emojis, extra whitespace.
  2. Lowercasing.
  3. Stop-word removal.
  4. Tokenization.
  5. Stemming (normalize related word forms).

This module has no external-API dependency — it uses regex + NLTK's
stopword list + a Porter stemmer, all of which run fully offline.
"""
import re
import string
from typing import List

try:
    from nltk.corpus import stopwords as nltk_stopwords
    from nltk.stem import PorterStemmer
    _STOPWORDS = set(nltk_stopwords.words("english"))
except LookupError:
    # Fallback minimal stopword list if NLTK data isn't available at runtime,
    # so the pipeline never hard-fails.
    _STOPWORDS = {
        "the", "is", "and", "of", "a", "an", "in", "on", "for", "to", "it",
        "this", "that", "with", "as", "are", "was", "were", "be", "been",
        "i", "you", "he", "she", "they", "we", "at", "by", "from", "or",
    }

_STEMMER = None


def _get_stemmer():
    global _STEMMER
    if _STEMMER is None:
        from nltk.stem import PorterStemmer
        _STEMMER = PorterStemmer()
    return _STEMMER


_URL_RE = re.compile(r"http\S+|www\.\S+")
_MENTION_RE = re.compile(r"@\w+")
_HASHTAG_SYMBOL_RE = re.compile(r"#")
_NUMBER_RE = re.compile(r"\d+")
_MULTI_SPACE_RE = re.compile(r"\s+")
_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F680-\U0001F6FF"  # transport & map symbols
    "\U0001F1E0-\U0001F1FF"  # flags
    "\U00002700-\U000027BF"
    "\U0001F900-\U0001F9FF"
    "\U00002600-\U000026FF"
    "]+",
    flags=re.UNICODE,
)


def clean_text(
    text: str,
    remove_urls: bool = True,
    remove_mentions: bool = True,
    remove_special_chars: bool = True,
    remove_numbers: bool = True,
    remove_emojis: bool = True,
    lowercase: bool = True,
) -> str:
    """Stage 1 of the pipeline: raw noisy text -> cleaned text."""
    if text is None:
        return ""
    text = str(text)

    if remove_urls:
        text = _URL_RE.sub(" ", text)
    if remove_mentions:
        text = _MENTION_RE.sub(" ", text)
    if remove_emojis:
        text = _EMOJI_RE.sub(" ", text)

    text = _HASHTAG_SYMBOL_RE.sub(" ", text)  # keep hashtag word, drop symbol

    if remove_numbers:
        text = _NUMBER_RE.sub(" ", text)

    if remove_special_chars:
        text = text.translate(str.maketrans("", "", string.punctuation))
        text = re.sub(r"[^a-zA-Z\s]", " ", text)

    if lowercase:
        text = text.lower()

    text = _MULTI_SPACE_RE.sub(" ", text).strip()
    return text


def tokenize(text: str) -> List[str]:
    """Stage: tokenization — splits cleaned text into word tokens."""
    if not text:
        return []
    return text.split()


def remove_stopwords(tokens: List[str]) -> List[str]:
    """Stage: stop-word removal."""
    return [t for t in tokens if t not in _STOPWORDS and len(t) > 1]


def stem_tokens(tokens: List[str]) -> List[str]:
    """Stage: stemming — normalizes related word forms."""
    stemmer = _get_stemmer()
    return [stemmer.stem(t) for t in tokens]


def preprocess_text(
    text: str,
    remove_urls: bool = True,
    remove_mentions: bool = True,
    remove_special_chars: bool = True,
    remove_numbers: bool = True,
    remove_emojis: bool = True,
    lowercase: bool = True,
    remove_stopwords_flag: bool = True,
    apply_stemming: bool = True,
) -> str:
    """Runs the full preprocessing pipeline on a single piece of text and
    returns the processed text as a space-joined string (ready for TF-IDF)."""
    cleaned = clean_text(
        text,
        remove_urls=remove_urls,
        remove_mentions=remove_mentions,
        remove_special_chars=remove_special_chars,
        remove_numbers=remove_numbers,
        remove_emojis=remove_emojis,
        lowercase=lowercase,
    )
    tokens = tokenize(cleaned)
    if remove_stopwords_flag:
        tokens = remove_stopwords(tokens)
    if apply_stemming:
        tokens = stem_tokens(tokens)
    return " ".join(tokens)
