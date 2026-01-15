import requests
import os
import dotenv
dotenv.load_dotenv()
api_key = os.getenv("GPTIFX_API")
print(api_key)
response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt51chat",
                "messages": "hello"
            }
        )
response.raise_for_status()
data = response.json()