from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
import bs4
import time
import os
import sys
import re

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../")))
print(sys.path)

from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.vectorstores import InMemoryVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from duckduckgo_search import DDGS

# Custom model import
from TextToImage.utils.node import diffusion_model_No_VQVAE

app = FastAPI()

# === GLOBALS ===
driver = None
vector_store = None
embeddings = HuggingFaceEmbeddings(model_name="all-mpnet-base-v2")

class GenerateRequest(BaseModel):
    prompt: str

class UrlRequest(BaseModel):
    url: str

class ClickRequest(BaseModel):
    Id: str
    Class: str
    TagName: str

class GetDataRequest(BaseModel):
    prompt: str
    k: int

class SearchByIDRequest(BaseModel):
    Id: str
    Class: str
    TagName: str
    text: str

class DuckDuckGoSearchRequest(BaseModel):
    query: str
    max_results: int

# === INIT FUNCTIONS ===

def init_driver():
    options = webdriver.ChromeOptions()
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-infobars")
    options.add_argument("--disable-dev-shm-usage")
    driver = webdriver.Chrome(options=options)
    return driver

# === ROUTES ===

@app.post("/Generate")
async def generate(data: GenerateRequest):
    prompts = [int(i) for i in re.split(r"[ ,]+", data.prompt)]
    model.generate(prompt=prompts, size=28)
    return {"result": f"The model has been generated {data.prompt}"}

@app.post("/GetPage")
async def get_page_route(data: UrlRequest):
    global driver
    if driver:
        driver.quit()
    driver = init_driver()
    driver.get(data.url)
    return {"result": "complete"}

@app.post("/Click")
async def click_page_route(data: ClickRequest):
    global driver
    id, classn, tag = data.Id, data.Class, data.TagName
    classn = ".".join(classn.split(" "))
    selector = f'{tag}{"#" + id if id else ""}{"." + classn if classn else ""}'
    try:
        elements = driver.find_elements(By.CSS_SELECTOR, selector)
    except Exception as e:
        return {"result": str(e)}

    for field in elements:
        if field.is_displayed() or field.is_enabled():
            try:
                field.click()
                return {"result": "Clicked"}
            except:
                return {"result": "Element cannot be clicked"}
    return {"result": "Element not found"}

@app.post("/GetSourcePage")
async def get_source_route():
    global vector_store
    vector_store = InMemoryVectorStore(embeddings)
    source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    soup = bs4.BeautifulSoup(source, "html.parser")

    elements = [
        element for element in soup.find_all(recursive=False)
        if element.name not in ["script", "img", "svg", "head", "link", "meta", "noscript", "style"]
        and element.text.strip()
    ]

    page_source = "\n".join(str(inp) for inp in elements)
    page_source = re.sub(r"<.*?>", "", page_source)
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=50)
    pages = text_splitter.split_text(page_source)
    _ = vector_store.add_texts(pages)
    return {"result": "complete"}

@app.post("/GetTextPage")
async def get_text():
    global vector_store
    vector_store = InMemoryVectorStore(embeddings)
    source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    soup = bs4.BeautifulSoup(source, "html.parser")
    soup_text = soup.get_text().replace("\n", "")
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    pages = text_splitter.split_text(soup_text)
    _ = vector_store.add_texts(pages)
    return {"result": "complete"}

@app.post("/GetData")
async def get_data(data: GetDataRequest):
    vector_search = vector_store.similarity_search(data.prompt, k=data.k)
    retrieved_docs = "\n\n".join(doc.page_content for doc in vector_search)
    return {"retrieved_docs": retrieved_docs}

@app.post("/Search_By_ID")
async def search_by_id(data: SearchByIDRequest):
    classn = ".".join(data.Class.split(" "))
    selector = f'{data.TagName}{"#" + data.Id if data.Id else ""}{"." + classn if classn else ""}'
    try:
        elements = driver.find_elements(By.CSS_SELECTOR, selector)
    except Exception as e:
        return {"result": str(e)}

    for field in elements:
        if field.is_displayed() or field.is_enabled():
            try:
                field.send_keys(data.text)
                field.send_keys(Keys.RETURN)
                return {"result": "Input and submitted"}
            except:
                return {"result": "Element not editable"}
    return {"result": "Element not found"}

@app.post("/Search_By_DuckDuckGo")
async def search_by_ddg(data: DuckDuckGoSearchRequest):
    results = []
    with DDGS() as ddgs:
        for i, r in enumerate(ddgs.text(data.query, max_results=data.max_results), 1):
            results.append({"title": r["title"], "link": r["href"]})
    return {"result": results}

# === MAIN ===

if __name__ == "__main__":
    import uvicorn
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
    uvicorn.run(app, host="0.0.0.0", port=5001)
