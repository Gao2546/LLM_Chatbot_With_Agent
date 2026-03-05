import base64   
import httpx   
import openai   
import os
import dotenv

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