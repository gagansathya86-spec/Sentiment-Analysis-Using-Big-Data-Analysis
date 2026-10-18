"""
Model Comparison & Evaluation Module
Evaluates Multinomial Naive Bayes (primary paper algorithm), Logistic Regression,
and Linear SVM (SGDClassifier) using identical TF-IDF vectorization and stratified splits.
"""
import time
from typing import Dict, Any, List
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.linear_model import LogisticRegression, SGDClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix

from nlp.preprocessing import preprocess_text


def compare_models(
    texts: pd.Series,
    labels: pd.Series,
    test_size: float = 0.2,
    max_features: int = 5000,
    random_state: int = 42
) -> Dict[str, Any]:
    """Trains and compares MultinomialNB, Logistic Regression, and Linear SVM
    on identical stratified train/test partitions."""
    # Preprocess texts
    cleaned_texts = [preprocess_text(str(t)) for t in texts]
    clean_labels = labels.astype(str).str.lower().str.strip()
    
    unique_labels = sorted(clean_labels.unique().tolist())
    if len(unique_labels) < 2:
        raise ValueError("Comparison requires at least 2 distinct sentiment classes.")
        
    X_train_raw, X_test_raw, y_train, y_test = train_test_split(
        cleaned_texts, clean_labels,
        test_size=test_size,
        random_state=random_state,
        stratify=clean_labels
    )
    
    # Vectorizer fit on train ONLY (avoids data leakage)
    vectorizer = TfidfVectorizer(max_features=max_features, ngram_range=(1, 2))
    X_train = vectorizer.fit_transform(X_train_raw)
    X_test = vectorizer.transform(X_test_raw)
    
    candidates = {
        "Multinomial Naive Bayes": MultinomialNB(alpha=1.0),
        "Logistic Regression": LogisticRegression(max_iter=1000, C=1.0, random_state=random_state),
        "Linear SVM (SGD)": SGDClassifier(loss="hinge", random_state=random_state)
    }
    
    results = []
    
    for model_name, clf in candidates.items():
        t0 = time.time()
        clf.fit(X_train, y_train)
        train_time = round(time.time() - t0, 4)
        
        y_pred = clf.predict(X_test)
        
        acc = accuracy_score(y_test, y_pred)
        prec, rec, f1, _ = precision_recall_fscore_support(y_test, y_pred, average="macro", zero_division=0)
        w_prec, w_rec, w_f1, _ = precision_recall_fscore_support(y_test, y_pred, average="weighted", zero_division=0)
        cm = confusion_matrix(y_test, y_pred, labels=unique_labels)
        
        # Per-class scores
        p_class, r_class, f_class, _ = precision_recall_fscore_support(
            y_test, y_pred, labels=unique_labels, zero_division=0
        )
        per_class = {
            lbl: {"precision": round(float(p), 4), "recall": round(float(r), 4), "f1": round(float(f), 4)}
            for lbl, p, r, f in zip(unique_labels, p_class, r_class, f_class)
        }
        
        results.append({
            "model_name": model_name,
            "accuracy": round(float(acc), 4),
            "macro_precision": round(float(prec), 4),
            "macro_recall": round(float(rec), 4),
            "macro_f1": round(float(f1), 4),
            "weighted_f1": round(float(w_f1), 4),
            "training_time_sec": train_time,
            "confusion_matrix": cm.tolist(),
            "per_class": per_class,
            "is_primary_paper_model": (model_name == "Multinomial Naive Bayes")
        })
        
    results.sort(key=lambda x: x["macro_f1"], reverse=True)
    
    return {
        "evaluation_summary": results,
        "labels": unique_labels,
        "sample_split": {
            "total_rows": len(texts),
            "train_rows": len(X_train_raw),
            "test_rows": len(X_test_raw),
            "test_split_ratio": test_size,
            "vocabulary_size": len(vectorizer.vocabulary_)
        },
        "best_model_by_f1": results[0]["model_name"]
    }
