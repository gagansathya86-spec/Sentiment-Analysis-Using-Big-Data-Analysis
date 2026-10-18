import csv
import sys
import os
import hashlib

filepath = r"c:\Users\gagan\Downloads\files\training.1600000.processed.noemoticon.csv\training.1600000.processed.noemoticon.csv"

file_size = os.path.getsize(filepath)

with open(filepath, 'r', encoding='ISO-8859-1') as f:
    reader = csv.reader(f)
    
    first_5_rows = []
    
    num_rows = 0
    num_columns = None
    column_names = []
    
    unique_target = set()
    missing_values = {}
    
    seen_hashes = set()
    duplicate_count = 0
    
    for idx, row in enumerate(reader):
        if idx == 0:
            # Check if there is a header. Sentiment140 actually does NOT have a header row by default.
            # Its format is usually: target, id, date, flag, user, text
            # We'll check if the first row looks like data or header.
            num_columns = len(row)
            # Sentiment140 usually has 6 columns
            # We will just treat it as data if it's the standard dataset, but let's record it.
            
        if idx < 5:
            first_5_rows.append(row)
            
        num_rows += 1
        
        # Target column is usually index 0
        if len(row) > 0:
            unique_target.add(row[0])
            
        # Missing values
        for i, val in enumerate(row):
            if not val.strip():
                missing_values[i] = missing_values.get(i, 0) + 1
                
        # Duplicates
        # We can hash the tuple
        row_hash = hash(tuple(row))
        if row_hash in seen_hashes:
            duplicate_count += 1
        else:
            seen_hashes.add(row_hash)

print(f"File Size: {file_size} bytes")
print(f"Number of Rows: {num_rows}")
print(f"Number of Columns: {num_columns}")
print(f"Duplicates: {duplicate_count}")
print(f"Unique target values: {unique_target}")
print(f"Missing values by column index: {missing_values}")
print("First 5 rows:")
for r in first_5_rows:
    print(r)
