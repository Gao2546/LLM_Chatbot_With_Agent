import os 
import httpx
import dotenv
import base64
import openai
dotenv.load_dotenv()
   
cert_path = os.getenv('YOUR-DOWNLOADED-CA-BUNDLE-CERT-PATH')   
window_user = os.getenv('WINDOWS_USER')
window_password = os.getenv('WINDOWS_PASSWORD') 
token = os.getenv("TOKEN")
basic_auth = False     
   
def generate_base64_string(username, password):   
    """   
    To Encode username & password strings into base64   
    """   
   
    sample_string = username + ":" + password   
    sample_string_bytes = sample_string.encode("ascii")   
   
    base64_bytes = base64.b64encode(sample_string_bytes)   
    base64_string = base64_bytes.decode("ascii")   
    return base64_string   
   
if basic_auth:   
    token = generate_base64_string(window_user, window_password)     
    headers = {      
    'Authorization': f"Basic {token}"      
    }   
else:    
    token = '<generated-token-from-url>'    
    headers = {     
        'Authorization': f"Bearer {token}",      }      
   
client = openai.OpenAI(     
            api_key=token,     
            base_url='https://gpt4ifx.icp.infineon.com',      
            default_headers=headers,     
            http_client = httpx.Client(verify=cert_path)   
            )    

print(client)

from openai import OpenAI

client = openai.OpenAI(     
        api_key=token,     
        base_url='https://gpt4ifx.icp.infineon.com',      
        default_headers=headers,     
        http_client = httpx.Client(verify=cert_path)   
        ) 
embeddings = client.embeddings.create(
            model = 'sfr-embedding-mistral',
            input= ["Hi, how are you"]*8
            )

print(embeddings)

import base64

def to_data_url(path: str) -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    # adjust mime if needed: image/jpeg, image/webp, ...
    return f"data:image/png;base64,{b64}"

# img = to_data_url("C:/Users/yuthaworawit/llm_project/cat.png")

# resp = client.chat.completions.create(
#     model="gpt-5.2",   # use whatever model name your endpoint supports
#     messages=[
#         {"role": "system", "content": "You are a helpful assistant."},
#         {"role": "user", "content": "Hello! Can you help me with chat?"},
#     ],
#     temperature=0.2,
# )
# print(resp.choices[0].message.content)

# resp = client.chat.completions.create(
#     model="gpt-5.2",  # must be vision-capable on your gateway
#     messages=[{
#         "role": "user",
#         "content": [
#             {"type": "text", "text": "What is it?"},
#             {"type": "image_url", "image_url": {"url": img}},  # img = https://... or data:image/...;base64,...
#         ],
#     }],
# )

# print(resp.choices[0].message.content)