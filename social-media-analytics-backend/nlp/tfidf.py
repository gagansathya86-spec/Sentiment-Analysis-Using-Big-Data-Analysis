"""
TF-IDF feature representation.

Wraps scikit-learn's TfidfVectorizer so the rest of the codebase depends on
a small, stable interface rather than sklearn directly. This is the exact
feature representation used in the paper (Term Frequency-Inverse Document
Frequency) prior to Multinomial Naive Bayes classification.
"""
from sklearn.feature_extraction.text import TfidfVectorizer


def build_vectorizer(max_features: int = 5000) -> TfidfVectorizer:
    """Creates a TF-IDF vectorizer configured for short, noisy social-media
    text that has already been through the cleaning pipeline."""
    return TfidfVectorizer(
        max_features=max_features,
        ngram_range=(1, 2),
        min_df=1,
        sublinear_tf=True,
    )
