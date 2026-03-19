#!/usr/bin/env python3
"""Debug Flask app routes"""

import sys
import os
sys.path.insert(0, r"c:\Users\chama\Desktop\LLM_Chatbot_With_Agent\Detect_Na\dashboard\backend")

# Import app
from app import app

print("Flask app routes:")
for rule in app.url_map.iter_rules():
    print(f"  {rule.rule} -> {rule.endpoint}")

print("\nTrying to get route / ...")
with app.test_client() as client:
    response = client.get('/')
    print(f"Status code: {response.status_code}")
    print(f"Content length: {len(response.get_data())}")
    print(f"Content type: {response.content_type}")
    content = response.get_data(as_text=True)
    print(f"First 200 chars: {content[:200]}")
