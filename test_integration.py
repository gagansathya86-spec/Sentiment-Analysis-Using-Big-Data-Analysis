import requests
import time

BASE_URL = "http://localhost:8000/api"

def test_workflow(sample_size):
    print(f"\n--- Testing Workflow with {sample_size} records ---")
    
    # 1. Upload/Prepare Sentiment140
    print("Preparing Sentiment140 sample...")
    res = requests.post(f"{BASE_URL}/upload-sentiment140", json={"sample_size": sample_size})
    if res.status_code != 200:
        print("Upload failed:", res.text)
        return
    data = res.json()
    dataset_id = data["dataset_id"]
    mapping = data["detected_mapping"]
    print(f"Dataset ID: {dataset_id}, Rows: {data['rows']}")
    
    # 2. Preprocess
    print("Running preprocessing...")
    res = requests.post(f"{BASE_URL}/datasets/{dataset_id}/preprocess", json={
        "mapping": mapping,
        "remove_urls": True,
        "remove_mentions": True,
        "remove_special_chars": True,
        "remove_numbers": True,
        "remove_emojis": True,
        "lowercase": True,
        "remove_stopwords": True,
        "apply_stemming": True,
        "drop_duplicates": True,
        "drop_missing_text": True
    })
    if res.status_code != 200:
        print("Preprocessing failed:", res.text)
        return
    print("Preprocessed rows:", res.json()["rows_after"])
    
    # 3. Train Model
    print("Training TF-IDF + Multinomial NB...")
    res = requests.post(f"{BASE_URL}/sentiment/train/{dataset_id}", json={
        "mapping": mapping,
        "test_split_size": 0.2,
        "tfidf_max_features": 5000,
        "nb_alpha": 1.0
    })
    if res.status_code != 200:
        print("Training failed:", res.text)
        return
    model = res.json()
    print(f"Accuracy: {model['accuracy']:.4f}")
    print(f"Precision: {model['macro_avg']['precision']:.4f}")
    print(f"Recall: {model['macro_avg']['recall']:.4f}")
    print(f"F1: {model['macro_avg']['f1_score']:.4f}")
    print("Confusion Matrix:", model['confusion_matrix'])
    
    # 4. Predict Dataset
    print("Predicting dataset...")
    res = requests.post(f"{BASE_URL}/sentiment/predict-dataset/{dataset_id}")
    if res.status_code != 200:
        print("Predict failed:", res.text)
        return
    print("Distribution:", res.json()["sentiment_distribution"])
    
    # 5. Behavior Analytics
    print("Generating behavior analytics...")
    res = requests.get(f"{BASE_URL}/analytics/{dataset_id}/behavior-summary")
    if res.status_code == 200:
        print("Behavior parsed ok. Engagement available?", res.json()["engagement"]["available"])
        
    # 6. Trends
    print("Generating trends...")
    res = requests.get(f"{BASE_URL}/analytics/{dataset_id}/sentiment-trends")
    if res.status_code == 200:
        print("Trends generated. Number of trend days:", len(res.json()))

    print("Dashboard...")
    res = requests.get(f"{BASE_URL}/analytics/{dataset_id}/dashboard")
    if res.status_code == 200:
        print("Dashboard generated successfully.")
        
test_workflow(10000)
test_workflow(50000)
