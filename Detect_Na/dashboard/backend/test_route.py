#!/usr/bin/env python3
"""Test if Flask routes are working"""

from flask import Flask, send_from_directory
import os

app = Flask(__name__)

frontend_dir = r"c:\Users\chama\Desktop\LLM_Chatbot_With_Agent\Detect_Na\dashboard\frontend"
index_file = os.path.join(frontend_dir, "index.html")

print(f"Frontend dir: {frontend_dir}")
print(f"Frontend dir exists: {os.path.isdir(frontend_dir)}")
print(f"Index.html path: {index_file}")
print(f"Index.html exists: {os.path.isfile(index_file)}")

@app.route("/")
def index():
    """Serve the frontend."""
    print(f"[Route /] Requested. Trying to send: {index_file}")
    try:
        result = send_from_directory(frontend_dir, "index.html")
        print(f"[Route /] Successfully created response")
        return result
    except Exception as e:
        print(f"[Route /] Error: {e}")
        raise

if __name__ == "__main__":
    print("\nStarting test server on http://localhost:5001")
    app.run(host="0.0.0.0", port=5001, debug=True, use_reloader=False)
