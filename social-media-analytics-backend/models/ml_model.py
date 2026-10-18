"""
Sentiment classification model: TF-IDF + Multinomial Naive Bayes.

This is the exact pipeline described in Section II-E of the paper. It is
the sole primary classifier used in this backend — no LLM, VADER,
TextBlob, or Transformer model is used for sentiment prediction.
"""
import os
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    confusion_matrix,
)

from nlp.tfidf import build_vectorizer
from config import settings


class SentimentModel:
    def __init__(self, max_features: int = None, alpha: float = None):
        self.max_features = max_features or settings.TFIDF_MAX_FEATURES
        self.alpha = alpha if alpha is not None else settings.NB_ALPHA
        self.vectorizer = build_vectorizer(self.max_features)
        self.classifier = MultinomialNB(alpha=self.alpha)
        self.labels_ = None

    def train(
        self,
        texts: pd.Series,
        labels: pd.Series,
        test_split_size: float = None,
        random_state: int = None,
    ) -> Dict[str, Any]:
        test_split_size = test_split_size or settings.TEST_SPLIT_SIZE
        random_state = random_state if random_state is not None else settings.RANDOM_STATE

        X_train_text, X_test_text, y_train, y_test = train_test_split(
            texts, labels,
            test_size=test_split_size,
            random_state=random_state,
            stratify=labels if labels.nunique() > 1 else None,
        )

        X_train = self.vectorizer.fit_transform(X_train_text)
        X_test = self.vectorizer.transform(X_test_text)

        self.classifier.fit(X_train, y_train)
        self.labels_ = sorted(labels.unique().tolist())

        y_pred = self.classifier.predict(X_test)

        acc = accuracy_score(y_test, y_pred)
        precision, recall, f1, support = precision_recall_fscore_support(
            y_test, y_pred, labels=self.labels_, zero_division=0
        )
        cm = confusion_matrix(y_test, y_pred, labels=self.labels_)

        macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
            y_test, y_pred, average="macro", zero_division=0
        )
        weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(
            y_test, y_pred, average="weighted", zero_division=0
        )

        return {
            "accuracy": float(acc),
            "precision": {lbl: float(p) for lbl, p in zip(self.labels_, precision)},
            "recall": {lbl: float(r) for lbl, r in zip(self.labels_, recall)},
            "f1_score": {lbl: float(f) for lbl, f in zip(self.labels_, f1)},
            "macro_avg": {"precision": float(macro_p), "recall": float(macro_r), "f1_score": float(macro_f1)},
            "weighted_avg": {"precision": float(weighted_p), "recall": float(weighted_r), "f1_score": float(weighted_f1)},
            "confusion_matrix": cm.tolist(),
            "labels": self.labels_,
            "train_rows": int(len(X_train_text)),
            "test_rows": int(len(X_test_text)),
            "vocabulary_size": int(len(self.vectorizer.vocabulary_)),
        }

    def predict(self, texts) -> Tuple[np.ndarray, np.ndarray]:
        """Returns (predicted_labels, probability_matrix)."""
        X = self.vectorizer.transform(texts)
        preds = self.classifier.predict(X)
        probs = self.classifier.predict_proba(X)
        return preds, probs

    def save(self, path: str) -> None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        joblib.dump(
            {
                "vectorizer": self.vectorizer,
                "classifier": self.classifier,
                "labels_": self.labels_,
                "max_features": self.max_features,
                "alpha": self.alpha,
            },
            path,
        )

    @classmethod
    def load(cls, path: str) -> "SentimentModel":
        data = joblib.load(path)
        model = cls(max_features=data["max_features"], alpha=data["alpha"])
        model.vectorizer = data["vectorizer"]
        model.classifier = data["classifier"]
        model.labels_ = data["labels_"]
        return model
