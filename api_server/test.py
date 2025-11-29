from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from bs4 import BeautifulSoup
from langchain_huggingface import HuggingFaceEmbeddings
import time
import re
import requests


def get_page_source_as_list(url):
    """
    Opens a web page using Selenium, retrieves the page source, parses it with BeautifulSoup,
    and returns a list of HTML elements, excluding script, image, and CSS elements.

    Args:
        url (str): The URL of the web page to open.

    Returns:
        list: A list of BeautifulSoup Tag objects representing the HTML elements
              (excluding script, image, and CSS elements),
              or None if an error occurred.
    """
    try:
        # Set up the Chrome driver (ensure you have chromedriver installed and in your PATH)
        service = Service('/usr/local/bin/chromedriver')
        # service = Service() # Use default path for chromedriver
        # options = webdriver.ChromeOptions()
        options = webdriver.FirefoxOptions()
        # options.add_argument("--user-data-dir=/home/athip/.config/firefox/")  # Update this path
        options.add_argument("--user-data-dir=/home/athip/.cache/mozilla/firefox/")  # Update this path
        # options.add_argument("--user-data-dir=/home/athip/.config/google-chrome/")  # Update this path
        options.add_argument("--profile-directory=Default")  # Change to "Profile 1" if needed
        # You can add options like headless mode if needed:
        # options.add_argument("--headless")
        # driver = webdriver.Chrome(options=options)
        driver = webdriver.Firefox(options=options)

        # Open the web page
        driver.get(url)

        # Get the page source
        # page_source = driver.page_source
        page_source = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
        print(driver.find_elements(By.CSS_SELECTOR, ".style-scope.ytmusic-carousel"))
        ta = "#suggestion-cell-0x0"
        print(driver.find_elements(By.CSS_SELECTOR, ta))
        ele = driver.find_elements(By.TAG_NAME, "yt-button-renderer")
        print("tttttttttttttttttttttttttttttttttt")
        print(ele)
        html = '''
<html>
  <body>
  <section>
    <div>
        <div>
            <div>
                <div>
                    <div>
                        <div>
                            <div>
                                <div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    </section>
    <input type="text" />
    <input type="checkbox" />
    <input type="radio" />
    <input type="file" />
    <input type="button" />
    <input type="submit" />
    <input type="reset" />
    <input type="hidden" />
    <input type="image" />
    <input type="password" />
    <input type="search" />
    <input type="tel" />
    <input type="url" />
    <input type="email" />
    <input type="number" />
    <input type="color" />
    <input type="range" />
    <input type="datetime" />
    <input type="datetime-local" />
    <input type="month" />
    <input type="week" />
    <input type="time" />
    <input type="date" />
    <input type="text" />
    <input type="checkbox" />
    <input type="radio" />
    <input type="file" />
    <input type="button" />
    <input type="submit" />
    <yt-icon></yt-icon>
    <tp-yt-paper-slider>
      <div></div>
      <custom-element></custom-element>
    </tp-yt-paper-slider>
    <div><another-custom-tag /></div>
  </body>
</html>
'''

        # Parse the HTML with BeautifulSoup
        soup = BeautifulSoup(page_source, 'html.parser')

        # body_children = soup.find_all(recursive=False, limit=None, _stacklevel = 2)

        # Extract all elements (tags) into a list, excluding script, img, and link (CSS) tags
        # elements = [
        #     {"tag_name":element.name, "tag_attrs": element.attrs, "tag_text": element.text}
        #     for element in body_children
        #     if element.name not in ['script', 'img', 'svg', 'link', 'meta', 'head', 'noscript', 'style', 'span', 'path', 'section', 'g', 'ellipse', 'circle', 'rect', 'polygon', 'polyline', 'defs', 'title', 'text', 'iron-iconset-svg', 'use', 'stop', 'symbol', 'foreignobject', 'marker', 'lineargradient', 'radialgradient', 'filter', 'fegaussianblur', 'fecolormatrix', 'feBlend', 'feoffset', 'feMerge', 'femergeNode', 'feflood', 'fecomposite', 'mask', 'clippath', 'iframe', 'template', 'dom-if', 'dom-repeat', 'dom-bind', 'dom-module', 'dom-if-children', 'dom-repeat-children', 'dom-bind-children', 'dom-module-children', 'style-scope', 'style-scope-iron-iconset-svg', 'style-scope-iron-iconset-svg-children']
        #                     and    element.text.strip() != '' 
        # ]
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
                                    'style-scope-iron-iconset-svg-children', 'seonuxt_main']
            and (element.text != '')
            # AND ensure the element has some stripped text content OR it's an input/textarea/button etc.
            # and (element.get_text(strip=True) != '' or element.name in ['input', 'textarea', 'button', 'a', 'select', 'option']) # Keep form elements and links even if textless
        ]

        print(len(elements))
        # print(str(elements[0])[:4000])
        # for element in elements:
            # print(element.name)
        page_source = "\n".join(str(inp) for inp in elements)  # แปลงเป็นสตริง
        page_source = page_source.replace("\n", "")


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

        with open('page_source.txt', 'w', encoding='utf-8') as f:
            f.write(page_source)
        # print(page_source)

        time.sleep(3)  # Wait for 5 seconds to see the opened page
        # Close the browser
        driver.quit()
        return elements

    except Exception as e:
        print(f"An error occurred: {e}")
        return None
    
from duckduckgo_search import DDGS
import time
from googlesearch import search

def scrape_google_search(query, max_results=10):
    """
    Scrapes Google for a given query and returns a formatted string of results
    up to a specified maximum number.
    """
    # Format the query for the URL
    formatted_query = query.replace(' ', '+')
    # Add num= parameter to hint to Google how many results we want per page
    # Note: Google may not always respect this number exactly.
    url = f"https://www.google.com/search?q={formatted_query}&num={max_results + 5}"

    # Set a User-Agent header to mimic a real browser visit
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
    }

    try:
        # --- Step 1: Request the page content ---
        print(f"🔍 Searching for '{query}' (up to {max_results} results)...")
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        print(response)

        # --- Step 2: Parse the HTML ---
        soup = BeautifulSoup(response.text, 'html.parser')
        print(soup )

        # --- Step 3: Find all result containers ---
        # 1. Select the <div id="search"> element first
        search_div = soup.select_one('#search')

        if not search_div:
            print("Could not find a <div id='search'> element in the file.")
            return
        
        # 2. Find all children <a> tags that have an href attribute within that div
        # The selector 'a[href]' specifically targets anchor tags with an href.
        links = search_div.select('a[href]')

        if not result_containers:
            print("❌ No results found. Google's HTML structure may have changed, or you might be blocked.")
            return ""

        output_string_list = []
        count = 1

        # --- Step 4: Loop through containers and extract data ---
        for container in result_containers:
            # Check if we have reached the desired number of results
            if count > max_results:
                break

            link_tag = container.select_one("div.yuRUbf a")
            description_tag = container.select_one("div.VwiC3b")

            if link_tag and description_tag:
                link = link_tag.get('href', 'N/A')
                description = description_tag.get_text(separator=" ", strip=True)

                # Format the entry as requested
                entry = (
                    f'{count}. link: "{link}"\n'
                    f'   description: "{description}"'
                )
                output_string_list.append(entry)
                # IMPORTANT: Only increment the counter when a valid result is found
                count += 1
        
        # --- Step 5: Join all entries into a single string ---
        return output_string_list

    except requests.exceptions.HTTPError as e:
        return f"HTTP Error: {e}\nThis often means Google has blocked your IP address (Error 429). Please wait and try again later."
    except Exception as e:
        return f"An unexpected error occurred: {e}"
    


def scrape_google_searchdd(query, max_results=10):
    """
    Scrapes Google for a given query and returns a formatted string of results
    up to a specified maximum number.
    """
    # Format the query for the URL
    formatted_query = query.replace(' ', '+')
    # Add num= parameter to hint to Google how many results we want per page
    # Note: Google may not always respect this number exactly.
    url = f"https://www.google.com/search?q={formatted_query}&num={max_results + 5}"

    # Set a User-Agent header to mimic a real browser visit
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
    }

    try:
        # --- Step 1: Request the page content ---
        print(f"🔍 Searching for '{query}' (up to {max_results} results)...")
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        print(response)

        soup = BeautifulSoup(response.text, 'html.parser')
        print(soup)

        # UPDATED SELECTORS based on the recent HTML structure
        result_containers = soup.select("div.Ww4FFb")

        if not result_containers:
            print("❌ No results found. Google's HTML may have changed or you're blocked.")
            return ""

        output_string_list = []
        count = 1

        for container in result_containers:
            if count > max_results:
                break

            link_tag = container.select_one("div.yuRUbf a")
            description_tag = container.select_one("div.VwiC3b")

            if link_tag and description_tag:
                link = link_tag.get('href', 'N/A')
                description = description_tag.get_text(separator=" ", strip=True)

                # Live Google searches often wrap links in a redirect.
                # This checks for and cleans the URL.
                if link.startswith("/url?q="):
                    link = link.split("/url?q=")[1].split("&sa=")[0]
                
                entry = (
                    f'{count}. link: "{link}"\n'
                    f'   description: "{description}"'
                )
                output_string_list.append(entry)
                count += 1
        
        return "\n\n".join(output_string_list)

    except requests.exceptions.HTTPError as e:
        return f"HTTP Error: {e}\nThis often means Google has temporarily blocked your IP. Try again in a few minutes."
    except Exception as e:
        return f"An unexpected error occurred: {e}"
    
def find_links_from_live_search(query):
    """
    Performs a live Google search for a query, then finds all 'href' attributes
    from anchor tags within the <div id="search">.
    """
    # Format the query for the URL
    formatted_query = query.replace(' ', '+')
    url = f"https://www.google.com/search?q={formatted_query}"

    # Set a User-Agent header to mimic a real browser visit
    headers = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
    }

    try:
        # 1. Fetch the webpage content using requests
        print(f"🔍 Performing live Google search for '{query}'...")
        response = requests.get(url, headers=headers)
        # Raise an exception for bad status codes (4xx or 5xx)
        response.raise_for_status()

        # 2. Parse the HTML content
        soup = BeautifulSoup(response.text, 'html.parser')
        print(soup)

        # 3. Select the <div id="search"> element
        search_div = soup.select_one('#search')

        if not search_div:
            print("Could not find a <div id='search'> element in the response.")
            return

        # 4. Find all children <a> tags that have an href attribute
        links = search_div.select('a[href]')

        print(f"\nFound {len(links)} links inside <div id='search'>:\n")

        # 5. Loop through and print the href value of each link
        for i, link_tag in enumerate(links):
            href = link_tag.get('href')
            print(f"{i+1}: {href}")

    except requests.exceptions.HTTPError as e:
        print(f"HTTP Error: {e}\nThis often means Google has blocked your IP. Try again in a few minutes.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from bs4 import BeautifulSoup
import time

def find_links_with_selenium(query):
    """
    Performs a live Google search using a real browser (Selenium) to avoid blocks,
    then finds all 'href' attributes from anchor tags within the <div id="search">.
    """
    formatted_query = query.replace(' ', '+')
    url = f"https://www.google.com/search?q={formatted_query}"

    # --- Selenium Setup ---
    # Set up Chrome options to run in headless mode (no visible browser window)
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36")
    
    # Automatically download and manage the Chrome driver
    service = Service(ChromeDriverManager().install())
    driver = None # Initialize driver to None

    try:
        # 1. Start the browser driver
        print("🚀 Starting browser...")
        driver = webdriver.Chrome(service=service, options=chrome_options)

        # 2. Fetch the webpage
        print(f"🔍 Performing live Google search for '{query}'...")
        driver.get(url)

        # Optional: Wait for the page to fully render
        time.sleep(5)

        # 3. Get the page's HTML source after it has been rendered by the browser
        html_content = driver.page_source

        # 4. Parse the HTML with BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        print(soup)

        # 5. Select the <div id="search"> element
        search_div = soup.select_one('#search')

        if not search_div:
            print("Could not find a <div id='search'> element. Google may have presented a CAPTCHA.")
            # Save the HTML to a file for inspection
            with open("captcha_page.html", "w", encoding="utf-8") as f:
                f.write(html_content)
            return

        # 6. Find all children <a> tags that have an href attribute
        links = search_div.select('a[href]')

        print(f"\nFound {len(links)} links inside <div id='search'>:\n")

        # 7. Loop through and print the href values
        for i, link_tag in enumerate(links):
            href = link_tag.get('href')
            print(f"{i+1}: {href}")

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        # 8. Important: Close the browser to free up resources
        if driver:
            print("\n✅ Closing browser.")
            driver.quit()



def search_duckduckgo(query, max_results=5):
    o = search(term=query,num_results=max_results, lang="th", region="th")
    print("Search results from Google:")
    for d in list(o):
        print(d)
    # print(list(o)[0])
    # with DDGS() as ddgs:
    #     results = ddgs.text(query, max_results=max_results, region="th-th")
    #     for i, result in enumerate(results, 1):
    #         print(f"{i}. {result['title']}\n{result['href']}\n")
    #         out_text += f"{i}. {result['title']}\n{result['href']}\n\n"
    #     print("Search completed.")
    #     print("out_text:", out_text)
    # with DDGS() as ddgs:
    #     time.sleep(1)  # Sleep to avoid hitting rate limits
    #     results = ddgs.text(query, max_results=max_results, region="th-th")
    #     print(results)
    #     for i, result in enumerate(results, 1):
    #         print(f"{i}. {result['title']}\n{result['href']}\n")

def Search_By_DuckDuckGo():
    st = time.time()
    query = "house price in thailanf"
    max_results = 5
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
        print("using google")
        results = list(search(term=query,num_results=int(max_results), lang="th", region="th", ssl_verify=True))
        for i, result in enumerate(results, 1):
            print(f"{i}. {result}\n")
            out_text += f"{i}. {result}\n\n"
        sto = time.time()
        print(f"Error occurred: {e}")
    print(f'complete dT = {sto - st} Sec')
    results = "\n\n".join(results)
    print(results)
    return results

if __name__ == "__main__":
    # emm = HuggingFaceEmbeddings(model_name = "sentence-transformers/all-mpnet-base-v2")
    # embeddings = HuggingFaceEmbeddings(model_name="paraphrase-MiniLM-L6-v2")
    # url_to_open = "https://music.youtube.com/search?q=%E0%B8%82%E0%B8%AD%E0%B9%83%E0%B8%AB%E0%B9%89%E0%B9%82%E0%B8%8A%E0%B8%84%E0%B9%80%E0%B8%A5%E0%B8%A7"  # Replace with the URL you want to open
    # elements = get_page_source_as_list(url_to_open)

    # if elements:
    #     print("HTML Elements (excluding script, img, and link):")
    #     for element in elements:
    #         # print(element)
    #         print(len(element))
    #         print("-" * 50)
    #     print(len(elements))
    # else:
    #     print("Failed to retrieve page source.")
    # aa = "\n\n\ntest\n\n\n"
    # aa.replace("\n", "")
    # print(aa)

    # query = input("Enter your search query: ")
    query = "ข้อมูลการปลูกทุเรียนแยกตามจังหวัด ประเทศไทย"
    # search_duckduckgo(query)
    # out = scrape_google_search(query,10)
    # find_links_from_live_search(query)
    # find_links_with_selenium(query)
    # print("\n\n".join(out))
    Search_By_DuckDuckGo()
