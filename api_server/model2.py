from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
import uvicorn
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
import bs4
from langchain import hub
# from langchain_community.document_loaders import WebBaseLoader
# from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
# from typing_extensions import List, TypedDict
# from langchain_ollama import OllamaEmbeddings
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_openai import OpenAIEmbeddings
import time
import random
# from flask_sqlalchemy import SQLAlchemy
# from flask_marshmallow import Marshmallow
import os
import sys

# Add project root to sys.path to allow absolute imports
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from TextToImage.utils.node import *

app = FastAPI()

# Pydantic models for request bodies
class GenerateRequest(BaseModel):
    prompt: str

class GetPageRequest(BaseModel):
    url: str

class ClickRequest(BaseModel):
    id: str

class GetDataRequest(BaseModel):
    prompt: str
    k: str

class SearchByIDRequest(BaseModel):
    id: str
    text: str

def init_driver():
    # Initialize the Chrome driver
    # options = webdriver.FirefoxOptions()
    options = webdriver.ChromeOptions()
    # options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    # options.add_argument('--headless')  # Run in headless mode
    # options.add_argument('--no-sandbox')
    # options.add_argument('--disable-dev-shm-usage')
    options.add_argument("--user-data-dir=/home/athip/.config/google-chrome/")  # Update this path
    options.add_argument("--profile-directory=Default")  # Change to "Profile 1" if needed

    options.add_argument("--start-maximized")  # Open browser in full-screen
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-infobars")
    options.add_argument("--disable-dev-shm-usage")
    # service = Service('/usr/local/bin/chromedriver')
    driver = webdriver.Chrome(options=options)
    # driver = webdriver.Firefox(options=options)
    return driver

@app.post("/Generate")
async def generate(req: GenerateRequest):
    prompt = req.prompt
    prompts = prompt.split(' ')
    s_prompt = []
    for i in prompts:
        s_prompt.append(int(i))
    model.generate(prompt=s_prompt, size=28)
    # Generate the model
    return {'result': f'The model has been generated {prompt}'}

@app.post("/GetPage")
async def get_page_route(req: GetPageRequest):
    global driver
    st = time.time()
    try:
        if driver:
            driver.quit()
    except:
        pass
    url = req.url
    # sp = url.split("/")
    # if len(sp) > 3:
    #     url = "/".join(sp[:-1])
    driver = init_driver()
    driver.get(url)
    print("complete")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec')
    return {'result': f'complete dT = {sto - st} Sec'}

@app.post("/Click")
async def click_page_route(req: ClickRequest):
    global driver
    st = time.time()
    id = req.id
    YTM_field = driver.find_elements(By.ID, id)
    if len(YTM_field) <= 0:
        YTM_field = driver.find_elements(By.CLASS_NAME, id)

    if YTM_field:
        for field in YTM_field:
           if field.is_displayed() and field.is_enabled():
                try:
                    field.send_keys(Keys.RETURN)
                    break
                except:
                    pass
    else:
        print("Element not found")
        raise HTTPException(status_code=404, detail="Element not found, use another id or class from search list")
        # else:
            # print("Element is not visible")
            # return jsonify({"complete":"use another id or class from search list"})
    # for char in "hello world":
    #     # input_box.send_keys(char)
    #     time.sleep(random.uniform(0.1, 0.3))
    print("complete")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec')
    return {'result': f'complete dT = {sto - st} Sec'}

@app.get("/GetSourcePage")
async def get_source_route():
    global vector_store
    global embeddings
    st = time.time()
    # embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    # embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")
    vector_store = InMemoryVectorStore(embeddings)
    print(time.time() - st,"ssssssssssssssssssssssssssss")
    page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    print(time.time() - st,"ssssssssssssssssssssssssssss")
    soup = bs4.BeautifulSoup(page_source, "html.parser")
    print(time.time() - st,"ssssssssssssssssssssssssssss")
    # elements = soup.find_all()
    elements = [
            element
            for element in soup.find_all()
            if (element.name not in ['script', 'img', 'svg', "link", 'meta','head','noscript','meta','style','span','path','section'])
        ]
    print(time.time() - st,"ssssssssssssssssssssssssssss")
    # inputs = soup.find_all(["input", "textarea"])  # ดึงเฉพาะ <input> elements
    # page_source = "\n".join(str(inp) for inp in elements)  # แปลงเป็นสตริง
    pages = [str(inp) for inp in elements]
    print(len(pages))
    _ = vector_store.add_texts(texts=pages)
    print(time.time() - st,"ssssssssssssssssssssssssssss")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec') # Return the converted data
    return {'result': f'complete dT = {sto - st} Sec'} # Return the converted data

@app.get("/GetTextPage")
async def get_text():
    global vector_store
    global embeddings
    st = time.time()
    # embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    # embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")
    vector_store = InMemoryVectorStore(embeddings)
    page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    soup = bs4.BeautifulSoup(page_source, "html.parser")
    soup_text = soup.get_text()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    pages = text_splitter.split_text(soup_text)
    _ = vector_store.add_texts(texts=pages)
    sto = time.time()
    print(f'complete dT = {sto - st} Sec') # Return the converted data
    return {'result': f'complete dT = {sto - st} Sec'}

@app.post("/GetData")
async def get_data(req: GetDataRequest):
    st = time.time()
    promt = req.prompt
    k = req.k
    vector_search = vector_store.similarity_search(promt, k=int(k))
    retrieved_docs = "\n\n".join(doc.page_content for doc in vector_search)
    # print(type(retrieved_docs))
    # print(len(retrieved_docs))
    # app.logger.info("test")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec')
    return {'retrieved_docs': retrieved_docs}

@app.post("/Search_By_ID")
async def Search_By_ID(req: SearchByIDRequest):
    global driver # Added global driver declaration
    st = time.time()
    id = req.id
    text = req.text


    YTM_field = driver.find_elements(By.ID, id)
    if len(YTM_field) <= 0:
        YTM_field = driver.find_elements(By.CLASS_NAME, id)

    if YTM_field:
        for field in YTM_field:
           if field.is_displayed() and field.is_enabled():
                try:
                    field.send_keys(text)
                    break
                except:
                    pass
        # else:
            # print("Element is not visible")
            # return jsonify({"complete":"use another id or class from search list"})
    # for char in "hello world":
    #     # input_box.send_keys(char)
    #     time.sleep(random.uniform(0.1, 0.3))
    field.send_keys(Keys.RETURN)
    sto = time.time()
    print(f'complete dT = {sto - st} Sec')
    return {"result":f'complete dT = {sto - st} Sec'}



if __name__ == '__main__':
    path_keys = os.popen("find ../ -name '.key'").read().split("\n")[0]
    with open(path_keys, "r") as f:
        key = f.read().strip()
    if not os.environ.get("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = key
    # embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    # embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
    # vector_store = InMemoryVectorStore(embeddings)
    # embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2") ## slowest and but efficient
    # embeddings = HuggingFaceEmbeddings(model_name="multi-qa-MiniLM-L6-cos-v1") ##fastest but less efficient
    embeddings = HuggingFaceEmbeddings(model_name="paraphrase-MiniLM-L6-v2") ## faster and more efficient
    image_c= 1
    img_size = 28
    model_ckp = "/home/athip/psu/learning_AI/TextToImage/model/checkpoint/DDPM_T0.pth"
    model_CLIP = "/home/athip/psu/learning_AI/TextToImage/model/checkpoint/CLIP0.pth"
    Text_dim = 512
    n_class = 10
    model = diffusion_model_No_VQVAE(
                in_c=image_c, 
                out_c=image_c,
                img_size=img_size,
                st_channel=64, 
                channel_multi=[1, 2, 4], 
                att_channel=64, 
                embedding_time_dim=64, 
                time_exp=256, 
                num_head=4, 
                d_model=32, 
                num_resbox=2, 
                allow_att=[True, True, True], 
                concat_up_down=True, 
                concat_all_resbox=True, 
                load_model_path=model_ckp,
                load_CLIP_path=model_CLIP,
                Text_dim=Text_dim,
                n_class=n_class

            )
    uvicorn.run("mcp_BrowserBase.model2:app", host="0.0.0.0", port=5001, reload=True)