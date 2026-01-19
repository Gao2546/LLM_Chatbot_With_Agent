import asyncio
import os
import random
import re
import sys
import time
from typing import List, TypedDict  # Added these as they are commonly used in LangChain/Python projects, though commented out in your original
import requests
import io # NEW IMPORT
import concurrent.futures
import multiprocessing
import numpy as np

# Third-party libraries
# import bs4
import dotenv
# import torch
import fitz # NEW IMPORT
# from duckduckgo_search import DDGS
from flask import Flask, jsonify, request, send_from_directory
# from googlesearch import search
from pandas import options
# from selenium import webdriver
# from selenium.common.exceptions import NoAlertPresentException, UnexpectedAlertPresentException
# from selenium.webdriver.common.alert import Alert
# from selenium.webdriver.common.by import By
# from selenium.webdriver.common.keys import Keys
# from selenium.webdriver.chrome.service import Service
# from webdriver_manager.chrome import ChromeDriverManager
# from selenium.webdriver.firefox.firefox_profile import FirefoxProfile
# from transformers import AutoModel, AutoTokenizer, BitsAndBytesConfig

# LangChain and related libraries
# from langchain_core.embeddings import Embeddings
# from langchain_core.vectorstores import InMemoryVectorStore
# from langchain_huggingface import HuggingFaceEmbeddings
# from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Local imports (assuming 'utils' is a local package/directory)
from utils.util import (
    # EditedFileSystem,
    encode_text_for_embedding,
    extract_docx_text,
    extract_excel_text,
    extract_image_text,
    extract_pdf_text,
    extract_pptx_text,
    extract_txt_file,
    extract_xls_text,
    get_image_embedding_jinna_api_local,
    get_image_embedding_nemoretriever_api_local,
    get_image_embedding_jinna_api_local_vllm,
    save_vector_to_db,
    search_similar_documents_by_chat,
    # model as embeddings,
    get_db_connection,
    upload_file_to_minio_and_db,
    get_image_embedding_jinna_api,
    save_page_vector_to_db,
    convert_pdf_page_to_image,
    search_similar_pages,
    process_pages_with_vlm,
    ollama_describe_image,
    ollama_embed_image,
    ollama_embed_text,
    ollama_generate_text,
    get_image_embedding_local_api_colpali_engine,
    search_similar_documents_by_active_user,
    search_similar_pages_by_active_user,
    search_similar_documents_by_active_user_all,
    search_similar_pages_by_active_user_all,
    DeepInfraInference,
    IFXGPTInference,
    IFXGPTEmbedding,
    read_stream,
)

from utils.util import LOCAL

conn = get_db_connection()

TEXT_FILE_EXTENSIONS = ['.txt', '.pdf', '.docx', '.pptx', '.odt', '.rtf']

# Load environment variables from .env file
dotenv.load_dotenv()

LOCAL = os.getenv("LOCAL", True)
IFXGPT = os.getenv("IFXGPT", True)

LOCAL = True if LOCAL == "True" else False
IFXGPT = True if IFXGPT == "True" else False

if LOCAL:
    print("Run model on local")
    vlm_provider = "Ollama"

else:
    print("Run model on server")
    vlm_provider = "DeepInfra"

# file_system = EditedFileSystem()

# Add project root to sys.path to allow absolute imports
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# from TextToImage.utils.node import *
# from object_detection_byVLM_Grounding_DINO.grounding_dino_api import detect_objects_from_url, detect_objects_from_image_bytes

app = Flask(__name__)

def clear_gpu():
    pass
    # import torch
    # import gc
    # if torch.cuda.is_available():
    #     torch.cuda.empty_cache()
    #     torch.cuda.ipc_collect()
    #     print("Cleared GPU memory.")
    # gc.collect()


def init_driver():
    # Initialize the Chrome driver
    # options = webdriver.FirefoxOptions()
    options = webdriver.ChromeOptions()
    # options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    # options.add_argument('--headless')  # Run in headless mode
    # options.add_argument('--no-sandbox')
    # options.add_argument('--disable-dev-shm-usage')
    # options.add_argument("--user-data-dir=/home/athip/.cache/mozilla/firefox/")  # Update this path
    # options.add_argument("--user-data-dir=/home/athip/.config/google-chrome/")  # Update this path
    options.add_argument("--profile-directory=Default")  # Change to "Profile 1" if needed

    options.add_argument("--start-maximized")  # Open browser in full-screen
    options.add_argument("--disable-blink-features=AutomationControlled")
    # options.add_argument("--no-sandbox")
    # options.add_argument("--disable-infobars")
    # options.add_argument("--disable-dev-shm-usage")

    # Check if running in Docker
    if os.environ.get("IS_DOCKER") == "true":
        print("Running in Docker, setting headless mode.")
        options.add_argument("--headless")  # สำคัญสำหรับ docker
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")  # แก้ปัญหา /dev/shm space
    options.add_argument("--disable-gpu")  # ป้องกันบางปัญหาใน Linux
    options.add_argument("--remote-debugging-port=9222")

    # service = Service('/usr/local/bin/chromedriver')
    # driver = webdriver.Chrome(options=options)
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()),options=options)
    # driver = webdriver.ChromiumEdge(options=options)
    # driver = webdriver.Firefox(options=options)
    return driver


def send_image_to_server(image_path, save_path_on_server):
    url = os.path.join(APP_URL,"api" ,"save_img")  # Replace with real IP
    print(f"Sending image to server at {url}")
    with open(image_path, "rb") as f:
        files = {"file": f}
        data = {"save_path": save_path_on_server}
        response = requests.post(url, files=files, data=data)
    response.raise_for_status()
    return response.json()

def get_page(driver, url):
    # Get the page
    try :
        driver.get(url)
    except Exception as e:
        driver.get("http://duckduckgo.com")
    # Wait for the page to load
    driver.implicitly_wait(1)
    # Get the page source
    page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    return page_source

@app.route('/test_db', methods=['GET'])
def test_db():
    """Test database connection and check document_embeddings table"""
    try:
        cur = conn.cursor()
        
        # Count total records
        cur.execute("SELECT COUNT(*) FROM document_embeddings")
        total_count = cur.fetchone()[0]
        
        # Get sample records
        cur.execute("SELECT user_id, chat_history_id, uploaded_file_id, page_number, created_at FROM document_embeddings ORDER BY created_at DESC LIMIT 5")
        sample_records = cur.fetchall()
        
        cur.close()
        
        return jsonify({
            'status': 'connected',
            'total_embeddings': total_count,
            'sample_records': [
                {
                    'user_id': r[0],
                    'chat_history_id': r[1],
                    'uploaded_file_id': r[2],
                    'page_number': r[3],
                    'created_at': str(r[4])
                } for r in sample_records
            ]
        }), 200
    except Exception as e:
        print(f"❌ Database connection error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


@app.route('/test_embedding_save', methods=['POST'])
def test_embedding_save():
    """Test saving an embedding to database"""
    try:
        data = request.get_json()
        
        test_data = {
            'user_id': data.get('user_id', 1),
            'chat_history_id': data.get('chat_history_id', 1),
            'uploaded_file_id': data.get('uploaded_file_id', 1),
            'file_name': data.get('file_name', 'test_file.txt'),
            'text': data.get('text', 'This is a test document for embedding'),
            'embedding': data.get('embedding') or [0.1] * 384,  # Default 384-dim vector
            'page_number': data.get('page_number', -1)
        }
        
        print(f"Testing save_vector_to_db with: {test_data}")
        
        # Try to save
        save_vector_to_db(**test_data)
        
        # Verify save
        cur = conn.cursor()
        cur.execute(
            "SELECT COUNT(*) FROM document_embeddings WHERE user_id = %s AND file_name = %s",
            (test_data['user_id'], test_data['file_name'])
        )
        count = cur.fetchone()[0]
        cur.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Test embedding saved successfully',
            'test_data': test_data,
            'verification_count': count
        }), 200
        
    except Exception as e:
        print(f"❌ Test embedding save error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500



    clear_gpu()
    prompt = request.json['prompt']
    img_url = request.json['img_url']
    prompts = re.split(r"[ ,]+", prompt)  # Splits on spaces and commas
    s_prompt = []
    for i in prompts:
        s_prompt.append(int(i))
    _, data_path, img_path = model.generate(prompt=s_prompt, size=28, img_url=img_url)
    res = send_image_to_server(data_path, img_path)
    print(f"Image sent to server: {res}")
    # Generate the model
    return jsonify({'result': f'The model has been generated {prompt}', 'data_path': img_path})

@app.route('/GetPage' , methods=['GET','POST'])
def get_page_route():
    global driver
    st = time.time()
    try:
        if driver:
            driver.quit()
    except:
        pass
    url = request.json['url']
    # sp = url.split("/")
    # if len(sp) > 3:
    #     url = "/".join(sp[:-1])
    driver = init_driver()
    driver.get(url)
    print("complete")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec')
    return jsonify({'result': f'complete dT = {sto - st} Sec'})

@app.route('/Click' , methods=['GET','POST'])
def click_page_route():
    global driver
    st = time.time()
    id = str(request.json['Id'])
    classn = str(request.json['Class'])
    tag = str(request.json['TagName'])
    print(id)
    print(len(id))
    print(classn)
    print(len(classn))
    print(tag)
    print(len(tag))
    try:
        # YTM_field = driver.find_elements(By.ID, id)
        # if len(YTM_field) <= 0:
        #     YTM_field = driver.find_elements(By.CLASS_NAME, id)
        # elements = driver
        # if len(id) > 0:
        #     print("Please select the ID")
        #     elements = elements.find_element(By.ID, id)
        #     print("ID")
        # if len(classn) > 0:
        #     print("Please select the class")
        #     classn = classn.split(" ")[0]
        #     elements = elements.find_element(By.CLASS_NAME, classn)
        #     print("Class")
        # if len(tag) > 0:
        #     print("Please select the tag")
        #     elements = elements.find_element(By.TAG_NAME, tag)
        #     print("TagName")
        # elements = elements.find_all()
        classn = ".".join(classn.split(" "))
        print(f'{tag}{"#" + id if len(id) > 0 else ""}{"." + classn if len(classn) > 0 else ""}')
        elements = driver.find_elements(By.CSS_SELECTOR, f'{tag}{"#" + id if len(id) > 0 else ""}{"." + classn if len(classn) > 0 else ""}')
        


    except Exception as e:
        return jsonify({"result": str(e)})

    if elements:
        for field in elements:
           if field.is_displayed() or field.is_enabled():
                try:
                    field.click()
                    # field.send_keys(Keys.RETURN)
                    break
                except:
                    return jsonify({"result":"Element cannot be clicked"})
    else:
        print("Element not found")
        return jsonify({"result":"Element not found, use another id or class from search list"})
        # else:
            # print("Element is not visible")
            # return jsonify({"complete":"use another id or class from search list"})
    # for char in "hello world":
    #     # input_box.send_keys(char)
    #     time.sleep(random.uniform(0.1, 0.3))
    print("complete")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec')
    return jsonify({'result': f'complete dT = {sto - st} Sec'})

@app.route('/GetSourcePage', methods=['GET','POST'])
def get_source_route():
    global vector_store
    clear_gpu()
    # global embeddings
    st = time.time()
    # embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    # embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")
    vector_store = InMemoryVectorStore(embeddings)
    # vector_store.delete()
    # print(time.time() - st,"ssssssssssssssssssssssssssss")
    # page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    try:
        page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    except UnexpectedAlertPresentException:
        alert = Alert(driver)
        # print(f"Alert found: {alert.text}")
        # alert.accept()  # or alert.dismiss()
        # Optionally retry the operation
        page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    # print(time.time() - st,"ssssssssssssssssssssssssssss")
    soup = bs4.BeautifulSoup(page_source, "html.parser")
    # print(time.time() - st,"ssssssssssssssssssssssssssss")
    # elements = soup.find_all()
    # Find all elements recursively
    elements = [
            element
            # {"tag_name":element.name, "tag_attrs": element.attrs, "tag_text": element.text.replace("\n", "")}
            for element in soup.find_all(recursive=False) # Iterate through all elements recursively
            # Keep elements whose tag name is not in the exclusion list
            if element.name not in ['script', 'img', 'svg', 'head', 'link', 'meta', 'noscript', 
                                    'style', 'span', 'path', 'section', 'g', 'ellipse', 'circle', 
                                    'rect', 'polygon', 'polyline', 'defs', #'title', 'text', 
                                    'iron-iconset-svg', 'use', 'stop', 'symbol', 'foreignobject', 
                                    'marker', 'lineargradient', 'radialgradient', 'filter', 'fegaussianblur', 
                                    'fecolormatrix', 'feBlend', 'feoffset', 'feMerge', 'femergeNode', 
                                    'feflood', 'fecomposite', 'mask', 'clippath', 'iframe', 'template', 
                                    'dom-if', 'dom-repeat', 'dom-bind', 'dom-module', 'dom-if-children', 
                                    'dom-repeat-children', 'dom-bind-children', 'dom-module-children', 
                                    'style-scope', 'style-scope-iron-iconset-svg', 
                                    'style-scope-iron-iconset-svg-children']
            and (element.text != '')
            # AND ensure the element has some stripped text content OR it's an input/textarea/button etc.
            # and (element.get_text(strip=True) != '' or element.name in ['input', 'textarea', 'button', 'a', 'select', 'option']) # Keep form elements and links even if textless
        ]
    # print(time.time() - st,"ssssssssssssssssssssssssssss")
    # inputs = soup.find_all(["input", "textarea"])  # ดึงเฉพาะ <input> elements
    page_source = "\n".join(str(inp) for inp in elements)  # แปลงเป็นสตริง
    page_source.replace("\n", "")


    unwanted_tags = [
        'script', 'img', 'svg', 'head', 'link', 'meta', 'noscript',
        'style', 'span', 'path', 'section', 'g', 'ellipse', 'circle',
        'rect', 'polygon', 'polyline', 'defs', 'iron-iconset-svg', 'use',
        'stop', 'symbol', 'foreignobject', 'marker', 'lineargradient', 
        'radialgradient', 'filter', 'fegaussianblur', 'fecolormatrix',
        'feBlend', 'feoffset', 'feMerge', 'femergeNode', 'feflood', 
        'fecomposite', 'mask', 'clippath', 'iframe', 'template',
        'dom-if', 'dom-repeat', 'dom-bind', 'dom-module', 'dom-if-children',
        'dom-repeat-children', 'dom-bind-children', 'dom-module-children',
        'style-scope', 'style-scope-iron-iconset-svg',
        'style-scope-iron-iconset-svg-children'
    ]

    # Join into regex alternation group
    tag_pattern = '|'.join(unwanted_tags)

    # Pattern to remove full tags including content (for paired tags)
    full_tag_re = re.compile(rf'<(?:{tag_pattern})\b[^>]*>.*?</(?:{tag_pattern})>', re.DOTALL | re.IGNORECASE)
    remove_tags_re = re.compile(rf'</?({tag_pattern})\b[^>]*>', re.IGNORECASE)

    # Pattern to remove self-closing or opening tags (like <img ...> or <br/>)
    self_closing_re = re.compile(rf'<(?:{tag_pattern})\b[^>]*?/?>', re.IGNORECASE)

    # Pattern to remove closing tags (like </tag>)
    closing_tag_re = re.compile(rf'</(?:{tag_pattern})>', re.IGNORECASE)

    page_source = remove_tags_re.sub('', page_source)
    page_source = self_closing_re.sub('', page_source)
    page_source = closing_tag_re.sub('', page_source)
    # print(page_source)

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=50)
    pages = text_splitter.split_text(page_source)
    # Convert selected elements (including their children) to strings
    # pages = [str(inp) for inp in elements]
    print(len(pages))
    _ = vector_store.add_texts(texts=pages)
    # print(time.time() - st,"ssssssssssssssssssssssssssss")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec') # Return the converted data
    return jsonify({'result': f'complete dT = {sto - st} Sec'}) # Return the converted data

@app.route('/GetTextPage', methods=['GET','POST'])
def get_text():
    global vector_store
    clear_gpu()
    # global embeddings
    st = time.time()
    # embeddings = OpenAIEmbeddings(model="text-embedding-3-small")
    # embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-mpnet-base-v2")
    vector_store = InMemoryVectorStore(embeddings)
    # vector_store.delete()
    # page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    try:
        page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    except UnexpectedAlertPresentException:
        alert = Alert(driver)
        print(f"Alert found: {alert.text}")
        alert.accept()  # or alert.dismiss()
        # Optionally retry the operation
        page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
    soup = bs4.BeautifulSoup(page_source, "html.parser")
    soup_text = soup.get_text()
    soup_text = soup_text.replace("\n", "")
    print(soup_text)
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    pages = text_splitter.split_text(soup_text)
    _ = vector_store.add_texts(texts=pages)
    sto = time.time()
    print(f'complete dT = {sto - st} Sec') # Return the converted data
    return jsonify({'result': f'complete dT = {sto - st} Sec'})

@app.route('/GetData', methods=['POST'])
def get_data():
    clear_gpu()
    st = time.time()
    promt = request.json['prompt']
    k = request.json['k']
    vector_search = vector_store.similarity_search(promt, k=int(k))
    retrieved_docs = "\n\n".join(doc.page_content for doc in vector_search)
    # print(type(retrieved_docs))
    # print(len(retrieved_docs))
    # app.logger.info("test")
    sto = time.time()
    print(f'complete dT = {sto - st} Sec')
    return jsonify({'retrieved_docs': retrieved_docs})

@app.route('/Search_By_ID', methods=['POST'])
def Search_By_ID():
    clear_gpu()
    st = time.time()
    id = str(request.json['Id'])
    classn = str(request.json['Class'])
    tag = str(request.json['TagName'])
    text = request.json['text']
    try:
        classn = ".".join(classn.split(" "))
        print(f'{tag}{"#" + id if len(id) > 0 else ""}{"." + classn if len(classn) > 0 else ""}')
        elements = driver.find_elements(By.CSS_SELECTOR, f'{tag}{"#" + id if len(id) > 0 else ""}{"." + classn if len(classn) > 0 else ""}')
        
    except Exception as e:
        return jsonify({"result": str(e)})

    if elements:
        for field in elements:
           if field.is_displayed() or field.is_enabled():
                try:
                    field.send_keys(text)
                    field.send_keys(Keys.RETURN)
                    sto = time.time()
                    print(f'complete dT = {sto - st} Sec')
                    return jsonify({"result":f'complete dT = {sto - st} Sec'})  
                except:
                    return jsonify({"result":"Element cannot be clicked"})
    else:
        print("Element not found")
        return jsonify({"result":"Element not found, use another id or class from search list"})

    # try:
    #     YTM_field = driver.find_elements(By.ID, id)
    #     if len(YTM_field) <= 0:
    #         YTM_field = driver.find_elements(By.CLASS_NAME, id)

        # if YTM_field:
        #     for field in YTM_field:
        #        if field.is_displayed() and field.is_enabled():
        #             try:
        #                 field.send_keys(text)
        #                 break
        #             except:
        #                 pass
        #     # else:
        #         # print("Element is not visible")
        #         # return jsonify({"complete":"use another id or class from search list"})
        # # for char in "hello world":
        # #     # input_box.send_keys(char)
        # #     time.sleep(random.uniform(0.1, 0.3))
        # field.send_keys(Keys.RETURN)
    #     sto = time.time()
    #     print(f'complete dT = {sto - st} Sec')
    #     return jsonify({"result":f'complete dT = {sto - st} Sec'})     
    # except Exception as e:
    #     return jsonify({"result": str(e)})

@app.route('/Search_By_DuckDuckGo', methods=['POST'])     
def Search_By_DuckDuckGo():
    st = time.time()
    query = request.json['query']
    max_results = request.json['max_results']
    out_text = ""
    try:
        with DDGS() as ddgs:
            results_tmp = []
            results = ddgs.text(query, max_results=int(max_results), region="th-th")
            for i, result in enumerate(results, 1):
                print(f"{i}. {result['title']}\n{result['href']}\n")
                results_tmp.append(f"{i}. {result['title']}\n{result['href']}\n")
                out_text += f"{i}. {result['title']}\n{result['href']}\n\n"
            results = results_tmp
        sto = time.time()
        print("use DDGS")
    except Exception as e:
        results = list(search(term=query,num_results=int(max_results), lang="th", region="th", ssl_verify=True))
        for i, result in enumerate(results, 1):
            print(f"{i}. {result}\n")
            out_text += f"{i}. {result}\n\n"
        sto = time.time()
        print(f"Error occurred: {e}")
    print(f'complete dT = {sto - st} Sec')
    results = "\n\n".join(results)
    return jsonify({'result': results})


# ==============================================================================
#  UPDATED & NEW RAG ENDPOINTS
# ==============================================================================

def convert_page_worker(args):
                    file_bytes, page_num_0_idx, dpi = args
                    img_bytes = convert_pdf_page_to_image(file_bytes, page_num_0_idx, dpi)
                    page_num_1_idx = page_num_0_idx + 1
                    return (page_num_1_idx, img_bytes)

@app.route('/process', methods=['POST'])
def process():
    """
    Processes uploaded files using one of two methods:
    1. 'legacy_text': Extracts all text, embeds it, saves to 'document_embeddings'.
    2. 'new_page_image': Splits PDF into pages, embeds each page as an image,
                       saves to 'document_page_embeddings'.
    
    FORM DATA required:
    - files: One or more files.
    - user_id: ID of the user.
    - chat_history_id: ID of the current chat.
    - processing_mode: 'legacy_text' (default) or 'new_page_image'.
    """
    clear_gpu()
    
    try:
        files = request.files.getlist('files')
        user_id = int(request.form.get('user_id'))
        chat_history_id = int(request.form.get('chat_history_id'))
        processing_mode = request.form.get('processing_mode', 'legacy_text')
    except Exception as e:
        return jsonify({"error": f"Invalid form data: {e}. 'user_id' and 'chat_history_id' must be integers."}), 400

    if not files:
        return jsonify({"error": "No files provided"}), 400

    print(f"Processing {len(files)} files with mode: '{processing_mode}'")
    
    processed_files = []
    n_pages = 0
    
    for file in files:
        filename = file.filename
        file.seek(0) # Rewind file pointer
        file_bytes = file.read()
        
        if not file_bytes:
            print(f"Skipped file (empty): {filename}")
            continue

        # --- 1. Upload file to MinIO and get its DB ID ---
        uploaded_file_id, object_name = upload_file_to_minio_and_db(
            user_id=user_id,
            chat_history_id=chat_history_id,
            file_name=filename,
            file_bytes=file_bytes
        )
        
        if not uploaded_file_id:
            print(f"Failed to upload {filename} to MinIO/DB. Skipping.")
            continue
        
        # --- 2. Branch processing based on mode ---

        n_pages = 1  # Default for non-PDF files
        if filename.endswith('.pdf'):
            pdf_file = fitz.open(stream=file_bytes, filetype='pdf')
            n_pages = pdf_file.page_count
        
        # if (processing_mode == 'legacy_text') or (n_pages <= 25):
        if (n_pages <= 5):
            # --- LEGACY TEXT PROCESSING ---
            print(f"Processing '{filename}' in legacy_text mode...")
            file_text = ""
            file_stream = io.BytesIO(file_bytes) # Use BytesIO for extractor functions
            file_stream.filename = filename # Add filename attribute
            
            if filename.lower().endswith('.pdf'):
                file_text = extract_pdf_text(file_stream)
            elif filename.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif')):
                file_text = extract_image_text(file_stream)
            elif filename.lower().endswith(('.docx','.doc','.odt','.rtf')):
                file_text = extract_docx_text(file_stream)
            elif filename.lower().endswith(('.pptx','.ppt')):
                file_text = extract_pptx_text(file_stream)
            elif filename.lower().endswith(('.xlsx','.xlsm')):
                file_text = extract_excel_text(file_stream)
            elif filename.lower().endswith('.xls'):
                file_text = extract_xls_text(file_stream)
            else:
                file_text = extract_txt_file(file_stream)

            if not file_text.strip():
                print(f"❌ Skipped file (empty or unsupported text): {filename}")
                continue
            
            print(f"✅ Text extracted: {len(file_text)} characters")
            
            try:
                data_vector = encode_text_for_embedding(file_text)
                print(f"✅ Vector created: {len(data_vector)} dimensions")
                
                save_vector_to_db(
                    user_id=user_id,
                    chat_history_id=chat_history_id,
                    uploaded_file_id=uploaded_file_id,
                    file_name=filename,
                    text=file_text,
                    embedding=data_vector,
                    page_number=-1
                )
                
                # ✅ Verify save to DB
                cur = conn.cursor()
                cur.execute(
                    "SELECT COUNT(*) FROM document_embeddings WHERE user_id = %s AND chat_history_id = %s AND uploaded_file_id = %s",
                    (user_id, chat_history_id, uploaded_file_id)
                )
                count = cur.fetchone()[0]
                cur.close()
                print(f"✅ Verification: {count} record(s) saved in DB for '{filename}'")
                
                processed_files.append(filename)
                
            except Exception as e:
                print(f"❌ Error saving to DB: {e}")
                import traceback
                traceback.print_exc()
                continue

        # elif (processing_mode == 'new_page_image') or (n_pages > 25):
        elif (n_pages > 5):
            # --- NEW IMAGE-PER-PAGE PROCESSING (BATCHED) ---
            if not filename.lower().endswith('.pdf'):
                print(f"Skipped file: 'new_page_image' mode only supports PDF. File: {filename}")
                continue
            
            print(f"Processing '{filename}' in new_page_image mode...")
            try:
                pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                num_pages = pdf_doc.page_count
                print(f"Found {num_pages} pages in '{filename}'.")
                
                pages_to_embed = [] # NEW: List to hold page data
                
                # # --- STAGE 1: Extract all page images ---
                # for page_num_0_idx in range(num_pages):
                #     page_num_1_idx = page_num_0_idx + 1
                #     print(f"  - Converting page {page_num_1_idx}/{num_pages} to image...")
                    
                #     # a. Convert page to image
                #     img_bytes = convert_pdf_page_to_image(file_bytes, page_num_0_idx)
                #     if not img_bytes:
                #         print(f"    - FAILED to render image for page {page_num_1_idx}. Skipping this page.")
                #         continue
                        
                #     # Add to our list to process in a batch
                #     pages_to_embed.append({
                #         "page_num_1_idx": page_num_1_idx,
                #         "img_bytes": img_bytes
                #     })

                start_process = time.time()
                with multiprocessing.Pool(processes=10) as pool:  # Adjust processes as needed
                    tasks = [(file_bytes, page_num_0_idx, 100) for page_num_0_idx in range(num_pages)]
                    results = pool.map(convert_page_worker, tasks)

                for page_num_1_idx, img_bytes in results:
                    if not img_bytes:
                        print(f" - FAILED to render image for page {page_num_1_idx}. Skipping this page.")
                        continue
                    # Add to our list to process in a batch
                    pages_to_embed.append({
                        "page_num_1_idx": page_num_1_idx,
                        "img_bytes": img_bytes
                    })
                
                pdf_doc.close()

                if not pages_to_embed:
                    print(f"No pages were successfully converted for '{filename}'. Skipping.")
                    continue

                # --- STAGE 2: Get all embeddings in one batch call ---
                print(f"  - Sending {len(pages_to_embed)} images to embedding model in one batch...")
                image_bytes_batch = [page['img_bytes'] for page in pages_to_embed]
                
                # NEW: Call wi(processing_mode == 'new_page_image') or th image_bytes_list
                if not LOCAL:
                    embeddings_list = get_image_embedding_jinna_api(image_bytes_list=image_bytes_batch) 
                else :
                    embeddings_list = get_image_embedding_jinna_api_local(image_bytes_list=image_bytes_batch)
                
                if not embeddings_list or len(embeddings_list) != len(pages_to_embed):
                    print(f"    - FAILED to get embeddings or count mismatch. Expected {len(pages_to_embed)}, Got {len(embeddings_list) if embeddings_list else 0}.")
                    continue
                    
                print(f"  - Received {len(embeddings_list)} embeddings. Saving to DB...")

                # --- STAGE 3: Save embeddings to DB ---
                for page_data, img_embedding in zip(pages_to_embed, embeddings_list):
                    # c. Save page embedding to new table
                    save_page_vector_to_db(
                        user_id=user_id,
                        chat_history_id=chat_history_id,
                        uploaded_file_id=uploaded_file_id,
                        page_number=page_data['page_num_1_idx'],
                        embedding=img_embedding
                    )
                
                processed_files.append(filename)
                
            except Exception as e:
                print(f"Error processing PDF '{filename}' for image embedding: {e}")

        else:
            print(f"Skipped file: Unknown processing_mode '{processing_mode}'")
    print(f"Process time: {time.time() - start_process} sec")

    clear_gpu()
    return jsonify({
        'reply': f"Processed {len(processed_files)}/{len(files)} files.",
        'processed_files': processed_files
    })


@app.route('/processDocument', methods=['POST'])
def process_document_api():
    """
    Endpoint to process documents for the Knowledge Base (forcing chat_history_id = -1).
    """
    clear_gpu()
    
    try:
        # 1. Get Form Data
        files = request.files.getlist('files')
        text_input = request.form.get('text', '')
        method = request.form.get('method', 'text')
        
        # Get user_id sent from TypeScript agent
        user_id_str = request.form.get('user_id')
        if not user_id_str:
            return jsonify({"error": "user_id is required from agent"}), 400
        user_id = int(user_id_str)

        # Force Chat ID to -1 for "Knowledge Base" / Global context
        chat_history_id = -1 

    except Exception as e:
        return jsonify({"error": f"Invalid form data: {e}"}), 400

    if not files and not text_input:
        return jsonify({"error": "No files or text provided"}), 400

    processed_files = []
    
    # --- SCENARIO A: Text Input Only ---
    if text_input and not files:
        print(f"Processing raw text input via {method} method...")
        
        # Create a dummy file record for pure text
        uploaded_file_id, object_name = upload_file_to_minio_and_db(
            user_id=0,
            chat_history_id=chat_history_id,
            file_name=f"text_snippet_{int(time.time())}.txt",
            file_bytes=text_input.encode('utf-8')
        )

        if method == 'image':
             # Logic if someone tries to "image encode" raw text (Use HyDE or Text-to-Image logic)
             # For now, we reuse the local embedding function which handles text input via HyDE
             if LOCAL:
                 print("local101")
                 embedding = get_image_embedding_jinna_api_local(text=text_input)
             else:
                 print("api101")
                 embedding = get_image_embedding_jinna_api(text=text_input)
             
             if embedding:
                 save_page_vector_to_db(user_id, chat_history_id, uploaded_file_id, 1, embedding)
                 processed_files.append({"name": "Raw Text", "status": "indexed_as_multimodal_text"})

        else:
            # Standard Text Embedding
            embedding = encode_text_for_embedding(text_input)
            save_vector_to_db(user_id, chat_history_id, uploaded_file_id, "Raw Text Input", text_input, embedding, -1)
            processed_files.append({"name": "Raw Text", "status": "indexed_as_legacy_text"})


    # --- SCENARIO B: File Processing ---
    for file in files:
        start_process = time.time()
        filename = file.filename
        file.seek(0)
        file_bytes = file.read()
        
        if not file_bytes:
            continue

        # 1. Upload to MinIO & DB
        user_id = 0
        uploaded_file_id, object_name = upload_file_to_minio_and_db(
            user_id=user_id,
            chat_history_id=chat_history_id,
            file_name=filename,
            file_bytes=file_bytes
        )
        
        if not uploaded_file_id:
            print(f"Failed to upload {filename}. Skipping.")
            continue

        # 2. Process based on Method
        
        # === METHOD: IMAGE (VLM / Multimodal Embeddings) ===
        if method == 'image':
            print(f"Processing '{filename}' via VLM/Image method...")
            try:
                pages_to_embed = []
                
                # A. Handle PDF
                if filename.lower().endswith('.pdf'):
                    pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                    num_pages = pdf_doc.page_count
                    
                    # Convert pages to images
                    # for page_num_0_idx in range(num_pages):
                    #     img_bytes = convert_pdf_page_to_image(file_bytes, page_num_0_idx)
                    #     if img_bytes:
                    #         pages_to_embed.append({
                    #             "page_num_1_idx": page_num_0_idx + 1,
                    #             "img_bytes": img_bytes
                    #         })
                    # pdf_doc.close()
                    cvt_time = time.time()
                    with multiprocessing.Pool(processes=10) as pool:  # Adjust processes as needed
                        tasks = [(file_bytes, page_num_0_idx, 50) for page_num_0_idx in range(num_pages)]
                        results = pool.map(convert_page_worker, tasks)

                    for page_num_1_idx, img_bytes in results:
                        if not img_bytes:
                            print(f" - FAILED to render image for page {page_num_1_idx}. Skipping this page.")
                            continue
                        # Add to our list to process in a batch
                        pages_to_embed.append({
                            "page_num_1_idx": page_num_1_idx,
                            "img_bytes": img_bytes
                        })
                    pdf_doc.close()
                    print(f"convertPDFIMG_time : {time.time() - cvt_time} sec")
                
                # B. Handle Images
                elif filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
                    pages_to_embed.append({
                        "page_num_1_idx": 1,
                        "img_bytes": file_bytes
                    })
                
                if not pages_to_embed:
                    print(f"No pages extracted from {filename}.")
                    continue

                # Batch Embed
                image_bytes_batch = [p['img_bytes'] for p in pages_to_embed]
                
                # Select Embedding Provider
                if LOCAL:
                    # Use local model (e.g., Jina v4 / ColPali)
                    print("local_101")
                    embeddings_list = get_image_embedding_jinna_api_local(image_bytes_list=image_bytes_batch)
                else:
                    # Use API
                    print("api_101")
                    embeddings_list = get_image_embedding_jinna_api(image_bytes_list=image_bytes_batch)
                
                # Save embeddings
                if embeddings_list and len(embeddings_list) == len(pages_to_embed):
                    for page_data, img_embedding in zip(pages_to_embed, embeddings_list):
                        save_page_vector_to_db(
                            user_id=user_id,
                            chat_history_id=chat_history_id,
                            uploaded_file_id=uploaded_file_id,
                            page_number=page_data['page_num_1_idx'],
                            embedding=img_embedding
                        )
                    processed_files.append({"name": filename, "status": "indexed_as_images", "pages": len(embeddings_list)})
                else:
                    print(f"Failed to generate embeddings for {filename}")

            except Exception as e:
                print(f"Error in image processing for {filename}: {e}")
                import traceback
                traceback.print_exc()

        # === METHOD: TEXT (Legacy OCR/Extraction) ===
        else:
            print(f"Processing '{filename}' via Legacy Text method...")
            try:
                file_text = ""
                # Wrap bytes for extractors
                file_stream = io.BytesIO(file_bytes)
                file_stream.filename = filename

                # Select Extractor
                if filename.lower().endswith('.pdf'):
                    file_text = extract_pdf_text(file_stream)
                elif filename.lower().endswith(('.png', '.jpg', '.jpeg', '.tiff', '.bmp', '.gif')):
                    file_text = extract_image_text(file_stream)
                elif filename.lower().endswith(('.docx','.doc','.odt','.rtf')):
                    file_text = read_stream(file_stream, filename)
                elif filename.lower().endswith(('.pptx','.ppt')):
                    file_text = read_stream(file_stream, filename)
                elif filename.lower().endswith(('.xlsx','.xlsm')):
                    file_text = read_stream(file_stream, filename)
                elif filename.lower().endswith('.xls'):
                    file_text = read_stream(file_stream, filename)
                else:
                    # Default to TXT extractor
                    file_text = extract_txt_file(file_stream)

                if file_text and file_text.strip():
                    # Split text into chunks (max 8164 tokens for IFXGPTEmbedding)
                    text_splitter = RecursiveCharacterTextSplitter(
                        chunk_size=6000,  # Conservative chunk size to stay under 8164 tokens
                        chunk_overlap=200,
                        separators=["\n\n", "\n", "。", "!", "?", " ", ""] # Added common punctuation
                    )
                    text_chunks = text_splitter.split_text(file_text)
                    print("size of chunck : ",len(text_chunks))
                    for c in text_chunks:
                        print(c)
                    
                    if not text_chunks:
                        print(f"No text chunks extracted from {filename}")
                        continue
                    
                    print(f"Processing {len(text_chunks)} chunks from {filename}")
                    
                    # Process each chunk
                    chunk_count = 0
                    for chunk_idx, chunk_text in enumerate(text_chunks, 1):
                        try:
                            # Generate embedding for this chunk
                            if IFXGPT:
                                data_vector = IFXGPTEmbedding(inputs=[chunk_text])[0]
                            else:
                                data_vector = encode_text_for_embedding(chunk_text)
                            
                            # Save chunk to database
                            save_vector_to_db(
                                user_id=user_id,
                                chat_history_id=chat_history_id,
                                uploaded_file_id=uploaded_file_id,
                                file_name=filename,
                                text=chunk_text,
                                embedding=data_vector,
                                page_number=chunk_idx  # Use chunk index as page number
                            )
                            chunk_count += 1
                        except Exception as chunk_err:
                            print(f"Error processing chunk {chunk_idx} from {filename}: {chunk_err}")
                            continue
                    
                    if chunk_count > 0:
                        processed_files.append({
                            "name": filename,
                            "status": "indexed_as_text",
                            "chunks": chunk_count
                        })
                        print(f"Successfully saved {chunk_count} chunks from {filename}")
                    else:
                        print(f"Failed to process any chunks from {filename}")
                else:
                    print(f"No text extracted from {filename}")

            except Exception as e:
                print(f"Error in text processing for {filename}: {e}")
        print(f"Process time: {time.time() - start_process} sec")

    clear_gpu()
    return jsonify({
        "status": "success", 
        "message": f"Successfully processed {len(processed_files)} items.",
        "details": processed_files,
        "FileID": uploaded_file_id,
    })


# @app.route('/search_similar', methods=['POST'])
# def search_similar_api():
#     """
#     LEGACY search endpoint. Searches the 'document_embeddings' table (text vectors).
#     """
#     clear_gpu()
#     data = request.get_json()
    
#     try:
#         query = data.get('query')
#         user_id = int(data.get('user_id'))
#         chat_history_id = int(data.get('chat_history_id'))
#         top_k = int(data.get('top_k', 5))
#     except Exception as e:
#         return jsonify({"error": f"Invalid data: {e}. 'user_id', 'chat_history_id', 'top_k' must be integers."}), 400

#     print(f"Searching LEGACY documents with query: {query}, user_id: {user_id}, chat_id: {chat_history_id}, top_k: {top_k}")

#     if not query or not user_id or not chat_history_id:
#         return jsonify({"error": "Missing required fields: query, user_id, chat_history_id"}), 400

#     results = search_similar_documents_by_chat(
#         query_text=query,
#         user_id=user_id,
#         chat_history_id=chat_history_id,
#         top_k=top_k
#     )

#     return jsonify({"results": results})

@app.route('/search_similar', methods=['POST'])
def search_similar_api_unified():
    """
    UNIFIED search endpoint. 
    Handles two modes via 'document_search_method':
    1. 'none' (Default): Search only the current chat history.
    2. 'searchDoc': Search ALL files where the current user is in 'active_users'.
    """
    u_time = time.time()
    clear_gpu()
    data = request.get_json()
    
    try:
        queryT = data.get('query')
        user_id = int(data.get('user_id'))
        chat_history_id = int(data.get('chat_history_id'))
        chat_history_messages = data.get('chat_history_messages', [])
        
        top_k_text = int(data.get('top_k_text', 5))
        top_k_pages = int(data.get('top_k_pages', 5))
        threshold_page = float(data.get('threshold_page', 0.5))
        threshold_text = float(data.get('threshold_text', 0.5))
        run_vlm_summary = bool(data.get('run_vlm_summary', True))
        document_search_method = data.get('documentSearchMethod', 'none') # Note: Check camelCase vs snake_case keys from frontend
        
    except Exception as e:
        return jsonify({"error": f"Invalid data: {e}."}), 400

    if not queryT or not user_id:
        return jsonify({"error": "Missing required fields: query, user_id"}), 400

    print(f"Running UNIFIED search. Mode: {document_search_method}, Query: {queryT}")
    
    legacy_results = []
    page_search_results = []

    create_search_prompt = f"""
Act as a document search engine (PDF document search by vector similarity). 
Write a single, concise sentence that simulates a direct excerpt from a document page answering the query below. 
Include likely keywords and factual phrasing.

User Query: {queryT}
Type of Document: Datasheet or Manual (Table, Graph, Diagram or Text)
Prompt Language: English
Prompt Type: Markdown
User Chat History Context: {chat_history_messages}

Output only the simulated excerpt.
""" #*****************
    if not LOCAL:
        if IFXGPT:
            search_text = IFXGPTInference(
                prompt=create_search_prompt,
                # system_prompt=system_prompt,
                # image_bytes_list=image_bytes_list,
                model_name= 'gpt-5-mini'#'Qwen/Qwen3-VL-8B-Instruct'#'qwen/qwen3-vl-8b-instruct'#'Qwen/Qwen2.5-VL-32B-Instruct'#'deepseek-ai/DeepSeek-OCR'#'Qwen/Qwen3-VL-30B-A3B-Instruct'#'deepseek-ai/DeepSeek-V3.2'#'Qwen/Qwen3-VL-30B-A3B-Instruct'#"Qwen/Qwen2.5-VL-32B-Instruct" #'x-ai/grok-4-fast'#"Qwen/Qwen2.5-VL-32B-Instruct" # Use a strong VLM
            )
        else:
            search_text = DeepInfraInference(
                prompt=create_search_prompt,
                # system_prompt=system_prompt,
                # image_bytes_list=image_bytes_list,
                model_name="Qwen/Qwen3-235B-A22B-Instruct-2507" #'x-ai/grok-4-fast'#"Qwen/Qwen2.5-VL-32B-Instruct" # Use a strong VLM
            )

    else :
        search_text = ollama_generate_text(
            prompt=create_search_prompt,
            model="gemma3:4b"
        )
    print(f"Search prompt: {search_text}")

    # =========================================================
    # METHOD 1: searchDoc (Search by active_users permission)
    # =========================================================
    if document_search_method == 'searchDoc':
        print(f"  - executing 'searchDoc' strategy for user {user_id}...")
        for i in range(0,9,2):
            print(f"Threshold : {threshold_text * float(np.log(np.exp(1) + i))}")
            # 1. Legacy Text Search
            for text in [search_text, queryT]:
                legacy_results = search_similar_documents_by_active_user(
                    query_text=text,
                    user_id=user_id,
                    top_k=top_k_text,
                    threshold_text=threshold_text * float(np.log(np.exp(1) + i)),
                )
                if legacy_results:
                    break

            # 2. New Page Image Search
            for text in [search_text, queryT]:
                page_search_results = search_similar_pages_by_active_user(
                    query_text=text,
                    user_id=user_id,
                    top_k=top_k_pages,
                    threshold=threshold_page * float(np.log(np.exp(1) + i)),
                )
                if page_search_results:
                    break

            if legacy_results or page_search_results:
                break

    elif document_search_method == 'searchdocAll':
        print(f"  - executing 'searchDocAll' strategy for user {user_id}...")
        
        for i in range(0,9,2):
            print(f"Threshold : {threshold_text * float(np.log(np.exp(1) + i))}")
            # 1. Legacy Text Search
            for text in [search_text, queryT]:
                legacy_results = search_similar_documents_by_active_user_all(
                    query_text=text,
                    user_id=user_id,
                    top_k=top_k_text,
                    threshold_text=threshold_text * float(np.log(np.exp(1) + i)),
                )
                if legacy_results:
                    break

            # 2. New Page Image Search
            for text in [search_text, queryT]:
                page_search_results = search_similar_pages_by_active_user_all(
                    query_text=text,
                    user_id=user_id,
                    top_k=top_k_pages,
                    threshold=threshold_page * float(np.log(np.exp(1) + i)),
                )
                if page_search_results:
                    break
                
            if legacy_results or page_search_results:
                break

    # =========================================================
    # METHOD 3: none (Search by current chat context)
    # =========================================================
    elif document_search_method == 'none':
        print(f"  - executing 'none' (chat context) strategy for chat {chat_history_id}...")
        
        # Check DB for Legacy Data
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM document_embeddings WHERE user_id=%s AND chat_history_id=%s LIMIT 1", (user_id, chat_history_id))
        has_legacy = cur.fetchone()
        
        # Check DB for New Page Data
        cur.execute("SELECT 1 FROM document_page_embeddings WHERE user_id=%s AND chat_history_id=%s LIMIT 1", (user_id, chat_history_id))
        has_pages = cur.fetchone()
        cur.close()


        for i in range(0,9,2):
            print(f"Threshold : {threshold_text * float(np.log(np.exp(1) + i))}")
            if has_legacy:
                for text in [search_text, queryT]:
                    legacy_results = search_similar_documents_by_chat(
                        query_text=text, 
                        user_id=user_id, 
                        chat_history_id=chat_history_id, 
                        top_k=top_k_text,
                        threshold_text=threshold_text * float(np.log(np.exp(1) + i)),
                    )
                    if legacy_results:
                        break

            if has_pages:
                for text in [search_text, queryT]:
                    page_search_results = search_similar_pages(
                        query_text=text, 
                        user_id=user_id, 
                        chat_history_id=chat_history_id, 
                        top_k=top_k_pages, 
                        threshold=threshold_page * float(np.log(np.exp(1) + i)),
                    )
                    if page_search_results:
                        break
            if legacy_results or page_search_results or ( not has_legacy and  not has_pages):
                break


    # =========================================================
    # VLM PROCESSING (Common for both methods)
    # =========================================================
    vlm_summary = None
    if page_search_results and run_vlm_summary:
        print(f"  - Found {len(page_search_results)} relevant pages. Sending to VLM ({vlm_provider}) for summary...")
        vlm_summary = process_pages_with_vlm(
            search_results=page_search_results,
            original_query=queryT
        )
        print(f"  - VLM summary: {vlm_summary}")
    elif not page_search_results:
        # If no visual pages found, we don't return a VLM error, just None
        # so the frontend sees purely text results if available.
        vlm_summary = None 
        
    clear_gpu()

    if not legacy_results and not vlm_summary:
        print("  - No results found in either legacy or page search.")
        return jsonify({"results": [""]})
    
    # Combine results
    final_output = legacy_results
    print(f" - legacy_results: {legacy_results}")
    if vlm_summary:
        final_output.append(vlm_summary)

    print(f" - final_output: {final_output}")
    print(f"Process time: {time.time() - u_time}s")
    return jsonify({"results": final_output})

# --- NEW RAG ENDPOINT ---
@app.route('/search_similar_pages', methods=['POST'])
def search_similar_pages_api():
    """
    NEW Multimodal RAG endpoint.
    1. Takes a text query.
    2. Searches 'document_page_embeddings' (image vectors).
    3. Retrieves the matching pages as images from MinIO.
    4. Sends images + query to a VLM (Ollama or DeepInfra).
    5. Returns the VLM's generated summary/answer.
    
    JSON Body:
    - query (str): The user's query.
    - user_id (int): User ID.
    - chat_history_id (int): Chat ID.
    - top_k (int, optional, default=3): Max pages to search for VLM.
    - threshold (float, optional, default=0.3): Distance threshold for page image search.
    - use_ollama (bool, optional, default=False): If True, use Ollama; if False, use DeepInfra.
    - ollama_model (str, optional, default='llava'): Ollama model name.
    - deepinfra_model (str, optional, default='Qwen/Qwen2.5-VL-32B-Instruct'): DeepInfra model name.
    """
    clear_gpu()
    data = request.get_json()
    
    try:
        query = data.get('query')
        user_id = int(data.get('user_id'))
        chat_history_id = int(data.get('chat_history_id'))
        top_k = int(data.get('top_k', 3))
        threshold = float(data.get('threshold', 0.3))
        use_ollama = bool(data.get('use_ollama', False))
        ollama_model = data.get('ollama_model', 'llava')
        deepinfra_model = data.get('deepinfra_model', 'Qwen/Qwen2.5-VL-32B-Instruct')
    except Exception as e:
        return jsonify({"error": f"Invalid data: {e}. 'user_id', 'chat_history_id', 'top_k', 'threshold' must be numbers."}), 400

    if not query or not user_id or not chat_history_id:
        return jsonify({"error": "Missing required fields: query, user_id, chat_history_id"}), 400

    print(f"Searching NEW page images with query: {query}, user_id: {user_id}, chat_id: {chat_history_id}, top_k: {top_k}, threshold: {threshold}, VLM provider: {vlm_provider}")

    # 1. Search for similar pages
    search_results = search_similar_pages(
        query_text=query,
        user_id=user_id,
        chat_history_id=chat_history_id,
        top_k=top_k,
        threshold=threshold
    )
    
    if not search_results:
        print("No relevant pages found.")
        return jsonify({"summary": "I could not find any relevant document pages for your query.", "search_results": []})

    print(f"Found {len(search_results)} relevant pages. Sending to VLM ({vlm_provider})...")

    # 2. Process pages with VLM (fetches images, calls appropriate VLM)
    vlm_summary = process_pages_with_vlm(
        search_results=search_results,
        original_query=query,
        use_ollama=use_ollama,
        ollama_model=ollama_model,
        deepinfra_model=deepinfra_model
    )
    
    clear_gpu()
    
    # 3. Return the final answer
    return jsonify({"results": [vlm_summary]})


# --- Helper for API responses ---
def _api_response(data, message="", status_code=200):
    """A consistent helper for creating JSON responses."""
    return jsonify({"data": data, "message": message}), status_code

# --- Helper to get required fields from request body ---
def _get_required_fields(data, *fields):
    """Checks for required fields in JSON data and returns them."""
    if not data:
        return None, _api_response(None, "Request body must be JSON.", 400)
    
    values = []
    for field in fields:
        value = data.get(field)
        if value is None:
            return None, _api_response(None, f"Missing required field in request body: '{field}'.", 400)
        values.append(value)
        
    return values, None

# ========== NEW: Analyze Image with VLM ==========
@app.route('/analyze_image', methods=['POST'])
def analyze_image_api():
    """
    Analyze an image using VLM and return description.
    Request: { "image_base64": "...", "prompt": "..." }
    Response: { "description": "..." }
    """
    try:
        data = request.get_json()
        image_base64 = data.get('image_base64')
        prompt = data.get('prompt', 'Describe this image in detail.')
        
        if not image_base64:
            return jsonify({"error": "image_base64 is required"}), 400
        
        # Decode base64 to bytes
        import base64
        image_bytes = base64.b64decode(image_base64)
        
        # Use VLM to describe image
        description = ""
        
        if LOCAL:
            # Use Ollama VLM
            description = ollama_describe_image(
                image_bytes=image_bytes,
                user_query=prompt,
                model='llava'
            )
        else:
            # Use DeepInfra VLM
            description = DeepInfraInference(
                prompt=prompt,
                base64_images_data=[image_base64],
                model_name='Qwen/Qwen2.5-VL-32B-Instruct'
            )
        
        return jsonify({"description": description or "Could not analyze image"})
        
    except Exception as e:
        print(f"Error in analyze_image: {e}")
        return jsonify({"error": str(e)}), 500

# ========== NEW: Extract Text from Document ==========
@app.route('/extract_text', methods=['POST'])
def extract_text_api():
    """
    Extract text from a document file (PDF, DOCX, TXT, etc.)
    Request: { "file_base64": "...", "file_name": "...", "mime_type": "..." }
    Response: { "text": "..." }
    """
    try:
        data = request.get_json()
        file_base64 = data.get('file_base64')
        file_name = data.get('file_name', 'document')
        mime_type = data.get('mime_type', '')
        
        if not file_base64:
            return jsonify({"error": "file_base64 is required"}), 400
        
        # Decode base64 to bytes
        import base64
        file_bytes = base64.b64decode(file_base64)
        
        extracted_text = ""
        
        # Determine file type and extract text
        file_ext = os.path.splitext(file_name)[1].lower() if file_name else ''
        
        if mime_type == 'application/pdf' or file_ext == '.pdf':
            # Extract text from PDF using PyMuPDF (fitz)
            try:
                pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                text_parts = []
                for page_num in range(min(len(pdf_doc), 20)):  # Limit to first 20 pages
                    page = pdf_doc[page_num]
                    text_parts.append(page.get_text())
                extracted_text = "\n".join(text_parts)
                pdf_doc.close()
            except Exception as pdf_err:
                print(f"PDF extraction error: {pdf_err}")
                extracted_text = ""
                
        elif mime_type == 'text/plain' or file_ext == '.txt':
            # Plain text file
            try:
                extracted_text = file_bytes.decode('utf-8')
            except:
                extracted_text = file_bytes.decode('latin-1', errors='ignore')
                
        elif 'word' in mime_type or file_ext in ['.docx', '.doc']:
            # Word document
            try:
                from io import BytesIO
                extracted_text = extract_docx_text(BytesIO(file_bytes))
            except Exception as doc_err:
                print(f"DOCX extraction error: {doc_err}")
                extracted_text = ""
                
        elif 'excel' in mime_type or 'spreadsheet' in mime_type or file_ext in ['.xlsx', '.xls']:
            # Excel file
            try:
                from io import BytesIO
                extracted_text = extract_excel_text(BytesIO(file_bytes))
            except Exception as xls_err:
                print(f"Excel extraction error: {xls_err}")
                extracted_text = ""
        
        # Clean up text
        if extracted_text:
            extracted_text = extracted_text.strip()
            # Remove excessive whitespace
            extracted_text = re.sub(r'\n{3,}', '\n\n', extracted_text)
            extracted_text = re.sub(r' {2,}', ' ', extracted_text)
        
        return jsonify({"text": extracted_text or ""})
        
    except Exception as e:
        print(f"Error in extract_text: {e}")
        return jsonify({"error": str(e)}), 500

# # --- File Listing (Remains GET as it doesn't target a specific resource) ---
# @app.route('/files/list', methods=['GET'])
# def api_list_files():
#     """
#     Lists all managed files.
#     Example: GET /files/list
#     """
#     files, error = file_system.list_files()
#     if error:
#         return _api_response(None, error, 500)
#     return _api_response({"files": files}, "Successfully listed files.")

# # --- Consolidated Read Endpoint ---
# @app.route('/files/read', methods=['POST'])
# def api_read_file():
#     """
#     Reads content from a file. The action is determined by the fields provided.
#     - To read all: {"file_name": "my_doc.txt"}
#     - To read specific lines: {"file_name": "my_doc.txt", "start_line": 1, "end_line": 5}
#     - To read from start to a line: {"file_name": "my_doc.txt", "end_line": 5}
#     """
#     data = request.get_json()
#     (file_name,), error_response = _get_required_fields(data, 'file_name')
#     if error_response:
#         return error_response

#     start_line = data.get('start_line')
#     end_line = data.get('end_line')

#     try:
#         # Case 1: Read specific line range
#         if start_line is not None and end_line is not None:
#             lines, error = file_system.read_line(file_name, int(start_line), int(end_line))
#             msg = f"Successfully read lines {start_line}-{end_line} from '{file_name}'."
#         # Case 2: Read from start until a specific line
#         elif end_line is not None:
#             lines, error = file_system.read_start_until_line_n(file_name, int(end_line))
#             msg = f"Successfully read from start to line {end_line} from '{file_name}'."
#         # Case 3: Read the whole file
#         else:
#             lines, error = file_system.read_all(file_name)
#             # read_all returns a list, join it for a single content string
#             lines = {"content": "\n".join(lines)} if not error else None
#             msg = f"Successfully read all content from '{file_name}'."

#         if error:
#             return _api_response(None, error, 404)
#         return _api_response(lines, msg)

#     except (TypeError, ValueError):
#         return _api_response(None, "Invalid 'start_line' or 'end_line' parameters. Must be integers.", 400)

# # --- Consolidated Edit Endpoint ---
# @app.route('/files/edit', methods=['POST'])
# def api_edit_file():
#     """
#     Edits or overwrites a file. The action is determined by the fields provided.
#     - To edit specific lines: {"file_name": "my_doc.txt", "text": "new line content", "start_line": 2, "end_line": 2}
#     - To overwrite the whole file: {"file_name": "my_doc.txt", "text": "all new content"}
#     """
#     data = request.get_json()
#     (file_name, text), error_response = _get_required_fields(data, 'file_name', 'text')
#     if error_response:
#         return error_response

#     start_line = data.get('start_line')
#     end_line = data.get('end_line')

#     try:
#         # Case 1: Edit specific lines
#         if start_line is not None and end_line is not None:
#             error = file_system.edit_line(file_name, text, int(start_line), int(end_line))
#             msg = f"Successfully edited lines {start_line}-{end_line} in '{file_name}'."
#         # Case 2: Overwrite the entire file
#         else:
#             error = file_system.edit_all(file_name, text)
#             msg = f"Successfully overwritten file '{file_name}'."

#         if error:
#             return _api_response(None, error, 400)
#         return _api_response(None, msg)

#     except (TypeError, ValueError):
#         return _api_response(None, "'start_line' and 'end_line' must be integers.", 400)


# # --- Consolidated Create Endpoint ---
# @app.route('/files/create', methods=['POST'])
# def api_create_file():
#     """
#     Creates a new file.
#     - To create an empty file: {"file_name": "new_empty.txt"}
#     - To create a file with content: {"file_name": "new_content.txt", "text": "initial content"}
#     """
#     data = request.get_json()
#     (file_name,), error_response = _get_required_fields(data, 'file_name')
#     if error_response:
#         return error_response
        
#     text = data.get('text')

#     # Case 1: Create file with text (overwrites if it exists)
#     if text is not None:
#         error = file_system.create_new_file_and_text(file_name, text)
#         msg = f"Successfully created file '{file_name}' with text."
#         if error:
#             return _api_response(None, error, 500) # Internal Server Error on create failure
#     # Case 2: Create an empty file only (fails if it exists)
#     else:
#         error = file_system.create_new_file_only(file_name)
#         msg = f"Successfully created empty file '{file_name}'."
#         if error:
#             return _api_response(None, error, 409) # 409 Conflict if file exists

#     return _api_response(None, msg, 201)

# # --- Delete Endpoint ---
# @app.route('/files/delete', methods=['POST'])
# def api_delete_file():
#     """
#     Deletes a file.
#     - Body: {"file_name": "file_to_delete.txt"}
#     """
#     data = request.get_json()
#     (file_name,), error_response = _get_required_fields(data, 'file_name')
#     if error_response:
#         return error_response

#     error = file_system.delete_file(file_name)
#     if error:
#         return _api_response(None, error, 404)
#     return _api_response(None, f"Successfully deleted file '{file_name}'.")

# # --- File Download Endpoint ---
# @app.route('/files/download', methods=['POST'])
# def api_download_file():
#     """
#     Downloads a specific file.
#     Note: Using POST for a download is non-standard for browsers but works for programmatic clients.
#     - Body: {"file_name": "my_document.txt"}
#     """
#     data = request.get_json()
#     (file_name,), error_response = _get_required_fields(data, 'file_name')
#     if error_response:
#         return error_response
        
#     full_path = file_system._get_full_path(file_name)
#     if not os.path.exists(full_path) or not os.path.isfile(full_path):
#         return _api_response(None, f"File '{file_name}' not found.", 404)

#     return send_from_directory(file_system.base_dir, file_name, as_attachment=True)


# # --- Folder Creation Endpoint ---
# @app.route('/files/create_folder', methods=['POST'])
# def api_create_folder():
#     """
#     Creates a new folder.
#     - Body: {"folder_name": "new_folder_name"}
#     """
#     data = request.get_json()
#     (folder_name,), error_response = _get_required_fields(data, 'folder_name')
#     if error_response:
#         return error_response

#     error = file_system.create_folder(folder_name)
#     if error:
#         return _api_response(None, error, 409) # 409 Conflict if folder exists, or 500 for other errors
#     return _api_response(None, f"Successfully created folder '{folder_name}'.", 201)


@app.route('/detect_objects', methods=['POST'])
def detect_objects_route():
    """
    Performs zero-shot object detection.
    
    Handles two input types:
    1. JSON body (Content-Type: application/json) with 'image_url' and 'text_labels'.
    2. Multipart form data (Content-Type: multipart/form-data) with 'file' and 'text_labels'.
    """
    clear_gpu()
    st = time.time()
    
    # --- 1. Initialize variables ---
    image_url = None
    image_bytes = None
    
    # --- 2. Determine input source (JSON vs. Form Data) ---
    if request.content_type and 'application/json' in request.content_type:
        # JSON Payload (for image URL)
        data = request.get_json()
        if not data:
            return jsonify({"error": "JSON body is required for URL input."}), 400
        
        image_url = data.get('image_url')
        text_labels_str = data.get('text_labels')
        box_threshold = data.get('box_threshold', 0.4)
        text_threshold = data.get('text_threshold', 0.3)
        
    elif request.files:
        # Multipart Form Data (for image bytes/upload)
        if 'file' not in request.files or request.files['file'].filename == '':
            return jsonify({"error": "No 'file' provided in the form data."}), 400
        
        file = request.files['file']
        image_bytes = file.read()
        
        # Get labels and thresholds from form fields
        text_labels_str = request.form.get('text_labels')
        box_threshold = request.form.get('box_threshold', 0.4)
        text_threshold = request.form.get('text_threshold', 0.3)
        
    else:
        return jsonify({"error": "Unsupported Content-Type or missing data. Use JSON (for URL) or Multipart Form (for file upload)."}), 400

    # --- 3. Validate and Parse Labels ---
    if not text_labels_str:
        return jsonify({"error": "Missing 'text_labels' field."}), 400

    try:
        # Assumes text_labels are a list/string that can be parsed (e.g., from a JSON list or a comma-separated string)
        if isinstance(text_labels_str, list):
            text_labels = [label.strip() for label in text_labels_str]
        else: # Handle comma-separated string from form data
            text_labels = [label.strip() for label in text_labels_str.split(',') if label.strip()]
            
        box_threshold = float(box_threshold)
        text_threshold = float(text_threshold)

    except Exception:
        return jsonify({"error": "Invalid format for 'text_labels' or thresholds."}), 400

    # --- 4. Run Detection based on Input Type ---
    detections, error_msg = [], ""
    
    if image_url:
        print(f"Running Grounding DINO on URL: {image_url}")
        detections, error_msg = detect_objects_from_url(
            image_url=image_url,
            text_labels=text_labels,
            box_threshold=box_threshold,
            text_threshold=text_threshold
        )
    elif image_bytes:
        print("Running Grounding DINO on uploaded image bytes.")
        detections, error_msg = detect_objects_from_image_bytes(
            image_bytes=image_bytes,
            text_labels=text_labels,
            box_threshold=box_threshold,
            text_threshold=text_threshold
        )
    else:
        return jsonify({"error": "Internal error: Could not determine image source."}), 500

    # --- 5. Return Result ---
    if error_msg:
        return jsonify({"error": error_msg}), 500

    sto = time.time()
    print(f'Grounding DINO complete. dT = {sto - st} Sec. Detections: {len(detections)}')
    
    return jsonify({
        'result': f'Successfully detected {len(detections)} objects.',
        'detections': detections,
        'duration_sec': round(sto - st, 3)
    })

# class GemmaEmbeddings(Embeddings):
#     def __init__(self, model_name: str = "google/embeddinggemma-300m", quantized: bool = True):
#         self.model_name = model_name
#         self.tokenizer = AutoTokenizer.from_pretrained(model_name)

#         if quantized:
#             bnb_config = BitsAndBytesConfig(load_in_8bit=True)
#             self.model = AutoModel.from_pretrained(
#                 model_name,
#                 device_map="auto",
#                 quantization_config=bnb_config,
#             )
#         else:
#             self.model = AutoModel.from_pretrained(model_name).to("cuda" if torch.cuda.is_available() else "cpu")

#         self.device = next(self.model.parameters()).device

#     def _embed(self, texts):
#         inputs = self.tokenizer(
#             texts, padding=True, truncation=True, return_tensors="pt"
#         ).to(self.device)
#         with torch.no_grad():
#             outputs = self.model(**inputs)
#             # Mean pooling
#             embeddings = outputs.last_hidden_state.mean(dim=1)
#         return embeddings.cpu().numpy()

#     def embed_documents(self, texts):
#         return self._embed(texts).tolist()

#     def embed_query(self, text):
#         return self._embed([text])[0].tolist()


# === VERIFIED ANSWERS ENDPOINT ===
@app.route('/encode_embedding', methods=['POST'])
def encode_embedding():
    """สร้าง embedding จากข้อความ
    
    Request body:
    {
        "text": "ข้อความที่ต้องการ embedding",
        "dimensions": 2048,  # optional (default: 2048 สำหรับ verified_answers)
        "is_query": false   # optional - true=ค้นหา, false=บันทึกเอกสาร (cross-lingual support)
    }
    """
    try:
        data = request.json
        text = data.get('text', '')
        dimensions = data.get('dimensions', 2048)  # Default: 2048
        is_query = data.get('is_query', False)  # Default: False (document mode)
        
        if not text:
            return jsonify({'error': 'No text provided'}), 400
        
        # ใช้ encode_text_for_embedding จาก utils
        # is_query=True ใช้ retrieval.query, False ใช้ retrieval.passage
        embedding = encode_text_for_embedding(text, target_dimensions=dimensions, is_query=is_query)
        
        # ตรวจสอบ dimensions ที่ได้กลับมา
        actual_dimensions = len(embedding)
        
        return jsonify({
            'success': True,
            'embedding': embedding,
            'dimensions': actual_dimensions,
            'requested_dimensions': dimensions
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# === LLM INFERENCE ENDPOINT (for AI Judge) ===
@app.route('/llm_inference', methods=['POST'])
def llm_inference():
    """เรียกใช้ LLM เพื่อ generate text
    
    Request body:
    {
        "prompt": "คำถามหรือ prompt ที่ต้องการให้ LLM ตอบ",
        "model": "llama3:latest",  # optional (default: llama3:latest)
        "system_prompt": ""  # optional
    }
    
    Used for: AI Judge to analyze AI vs Human answers
    """
    try:
        data = request.json
        prompt = data.get('prompt', '')
        model = data.get('model', 'llama3:latest')  # Use llama3 as default (available locally)
        system_prompt = data.get('system_prompt', '')
        
        if not prompt:
            return jsonify({'error': 'No prompt provided'}), 400
        
        # Use ollama_generate_text from utils
        response = ollama_generate_text(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt
        )
        
        return jsonify({
            'success': True,
            'response': response,
            'model': model
        })
    except Exception as e:
        print(f"LLM inference error: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'response': ''
        }), 500


if __name__ == '__main__':
    # path_keys = os.popen("find ../ -name '.key'").read().split("\n")[0]
    # with open(path_keys, "r") as f:
    #     key = f.read().strip()

    
    # APP_URL = os.getenv("API_APP", "http://localhost:5000")
    # api_key = os.getenv("OPENAI_API_KEY")
    # if not os.environ.get("OPENAI_API_KEY"):
    #     os.environ["OPENAI_API_KEY"] = api_key

    # model_name = "google/embeddinggemma-300m"

    
    # Configure quantization (new method)
    # bnb_config = BitsAndBytesConfig(
    #     # load_in_8bit=True,              # or 
    #     load_in_4bit=True,
    #     llm_int8_threshold=6.0,
    # )



    # embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L12-v2") # *** ***
    # embeddings = OpenAIEmbeddings(model="text-embedding-3-small") *** *** ***
    # embeddings = HuggingFaceEmbeddings(model_name="nomic-ai/nomic-embed-text-v2-moe")
    # embeddings = HuggingFaceEmbeddings(model_name="all-mpnet-base-v2") ## slowest and but efficient *** *** ***
    # embeddings = HuggingFaceEmbeddings(model_name="google/embeddinggemma-300m")

    # embeddings = GemmaEmbeddings(model_name="google/embeddinggemma-300m", quantized=True)
    
    # embeddings = HuggingFaceEmbeddings(model_name="voyageai/voyage-3.5-lite")
    # embeddings = HuggingFaceEmbeddings(model_name="multi-qa-MiniLM-L6-cos-v1") ##fastest but less efficient
    # embeddings = HuggingFaceEmbeddings(model_name="paraphrase-multilingual-MiniLM-L12-v2") ## fastest and efficient *** ***
    # embeddings = HuggingFaceEmbeddings(model_name="paraphrase-MiniLM-L12-v2") ## faster and more efficient *** *** *
    # vector_store = InMemoryVectorStore(embeddings)

    # image_c= 1
    # img_size = 28
    # model_ckp = "./TextToImage/model/checkpoint/DDPM_T0.pth"
    # model_CLIP = "./TextToImage/model/checkpoint/CLIP0.pth"
    # Text_dim = 512
    # n_class = 10
    # model = diffusion_model_No_VQVAE(
    #             in_c=image_c, 
    #             out_c=image_c,
    #             img_size=img_size,
    #             st_channel=64, 
    #             channel_multi=[1, 2, 4], 
    #             att_channel=64, 
    #             embedding_time_dim=64, 
    #             time_exp=256, 
    #             num_head=4, 
    #             d_model=32, 
    #             num_resbox=2, 
    #             allow_att=[True, True, True], 
    #             concat_up_down=True, 
    #             concat_all_resbox=True, 
    #             load_model_path=model_ckp,
    #             load_CLIP_path=model_CLIP,
    #             Text_dim=Text_dim,
    #             n_class=n_class

    #         )
    app.run(host='0.0.0.0', port=5000, debug=False)
