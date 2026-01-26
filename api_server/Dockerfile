# FROM nvidia/cuda:12.2.2-runtime-ubuntu22.04

# # Optional: use a Python version of your choice
# ENV PYTHONDONTWRITEBYTECODE=1
# ENV PYTHONUNBUFFERED=1
# # Set DEBIAN_FRONTEND to avoid interactive prompts
# ENV DEBIAN_FRONTEND=noninteractive

# # Install system dependencies + Python
# RUN apt-get update && \
#     apt-get install -y --no-install-recommends \
#         python3 python3-pip python3-dev \
#         wget curl git && \
#     ln -s /usr/bin/python3 /usr/bin/python && \
#     pip3 install --upgrade pip && \
#     apt-get clean && \
#     rm -rf /var/lib/apt/lists/*

# # --- Optional: Install Chrome and ChromeDriver (Uncomment if needed) ---
# # Be aware: This will significantly increase your Docker image size.
# # Ensure you really need a full browser and WebDriver inside this container.
# # RUN apt-get update && apt-get install -y --no-install-recommends \
# #     fonts-liberation \
# #     libasound2 \
# #     libatk-bridge2.0-0 \
# #     libatk1.0-0 \
# #     libc6 \
# #     libcairo2 \
# #     libcups2 \
# #     libdbus-1-3 \
# #     libexpat1 \
# #     libfontconfig1 \
# #     libgbm1 \
# #     libgcc1 \
# #     libglib2.0-0 \
# #     libgtk-3-0 \
# #     libnspr4 \
# #     libnss3 \
# #     libpango-1.0-0 \
# #     libpangocairo-1.0-0 \
# #     libstdc++6 \
# #     libx11-6 \
# #     libx11-xcb1 \
# #     libxcb1 \
# #     libxcomposite1 \
# #     libxcursor1 \
# #     libxdamage1 \
# #     libxext6 \
# #     libxfixes3 \
# #     libxi6 \
# #     libxrandr2 \
# #     libxrender1 \
# #     libxss1 \
# #     libxtst6 \
# #     lsb-release \
# #     && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
# #     && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
# #     && apt-get update \
# #     && apt-get install -y google-chrome-stable \
# #     # Install ChromeDriver
# #     # Dynamically fetch the latest stable ChromeDriver version compatible with the installed Chrome
# #     && CHROME_VERSION=$(google-chrome --version | cut -d' ' -f3 | cut -d'.' -f1) \
# #     && CHROME_DRIVER_VERSION=$(wget -qO- "https://chromedriver.storage.googleapis.com/LATEST_RELEASE_$CHROME_VERSION") \
# #     && echo "Installing ChromeDriver version: $CHROME_DRIVER_VERSION for Chrome $CHROME_VERSION" \
# #     && wget -q --continue -P /tmp "https://chromedriver.storage.googleapis.com/$CHROME_DRIVER_VERSION/chromedriver_linux64.zip" \
# #     && unzip /tmp/chromedriver_linux64.zip -d /usr/local/bin \
# #     && rm /tmp/chromedriver_linux64.zip \
# #     && chmod +x /usr/local/bin/chromedriver \
# #     # Clean up
# #     && apt-get clean \
# #     && rm -rf /var/lib/apt/lists/*
# # --- End Optional Chrome/ChromeDriver Section ---

# # Set the working directory in the container
# WORKDIR /app

# # Copy the requirements file into the container at /app
# # This leverages Docker's build cache: if requirements.txt doesn't change,
# # the pip install step won't re-run.
# COPY ../requirements.txt .

# # Install Python dependencies from requirements.txt
# # --no-cache-dir: Prevents pip from storing downloaded packages in a cache.
# # --break-system-packages: Allows pip to install into system directories,
# #                          necessary on some Debian-based systems when not using a venv.

# RUN apt-get update && \
#     apt-get install -y \
#         software-properties-common \
#         lsb-release \
#         wget \
#         curl \
#         gnupg \
#         ca-certificates && \
#     apt-get install -y \
#         tesseract-ocr \
#         libtesseract-dev && \
#     apt-get clean && \
#     rm -rf /var/lib/apt/lists/*

# RUN apt-get update && \
#     apt-get install -y tesseract-ocr-tha

# RUN tesseract --version

# RUN apt-get update && \
#     apt-get install -y \
#         tesseract-ocr \
#         libtesseract-dev \
#         libglib2.0-0 \
#         libsm6 \
#         libxrender1 \
#         libxext6 \
#         ffmpeg \
#         fonts-liberation \
#         libnss3 \
#         libatk-bridge2.0-0 \
#         libgtk-3-0 \
#         curl \
#         unzip && \
#     apt-get clean && rm -rf /var/lib/apt/lists/*




# # Install Chrome and ChromeDriver
# RUN apt-get update && apt-get install -y wget unzip gnupg ca-certificates && \
#     wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | \
#       gpg --dearmor -o /etc/apt/trusted.gpg.d/google.gpg && \
#     echo "deb [arch=amd64 signed-by=/etc/apt/trusted.gpg.d/google.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
#       > /etc/apt/sources.list.d/google-chrome.list && \
#     apt-get update && apt-get install -y google-chrome-stable

# # Detect Chrome major version
# RUN CHROME_VERSION=$(google-chrome-stable --version | grep -oP '\d+\.\d+\.\d+\.\d+' || true) && \
#     CHROME_MAJOR_VERSION=$(echo "$CHROME_VERSION" | cut -d'.' -f1 || echo "114") && \
#     echo "Detected Chrome Version: $CHROME_VERSION (Major: $CHROME_MAJOR_VERSION)" && \
#     CHROMEDRIVER_VERSION=$(wget -qO- "https://chromedriver.storage.googleapis.com/LATEST_RELEASE_$CHROME_MAJOR_VERSION" || echo "114.0.5735.90") && \
#     echo "Installing ChromeDriver version: $CHROMEDRIVER_VERSION" && \
#     wget -O /tmp/chromedriver.zip "https://chromedriver.storage.googleapis.com/${CHROMEDRIVER_VERSION}/chromedriver_linux64.zip" && \
#     unzip /tmp/chromedriver.zip -d /usr/local/bin && \
#     chmod +x /usr/local/bin/chromedriver && \
#     rm /tmp/chromedriver.zip



# RUN pip install --no-cache-dir --ignore-installed -r requirements.txt --break-system-packages

# # Copy the application code and necessary directories
# # Assumes the Docker build context is the parent directory (e.g., your project root)
# # Ensure these paths are correct relative to your build context.
# COPY ./ /app/
# # COPY ../TextToImage/utils/ /app/TextToImage/utils/
# # COPY ../TextToImage/model/checkpoint/ /app/TextToImage/model/checkpoint/

# # Create output directory
# # RUN mkdir -p /app/TextToImage/output

# # Set environment variables for Docker deployment
# ENV DATABASE_URL=postgres://athip:123456@llm-chatbot-with-agent-postgresql:5432/ai_agent \
#     PGDATABASE=ai_agent \
#     PGUSER=athip \
#     PGPASSWORD=123456 \
#     PGHOST=llm-chatbot-with-agent-postgresql \
#     PGPORT=5432 \
#     API_SERVER_URL=http://llm-chatbot-with-agent-api-server:5000 \
#     API_OLLAMA=http://llm-chatbot-with-agent-ollama:11434/api/generate \
#     API_APP=http://llm-chatbot-with-agent-core:3000 \
#     IS_DOCKER=true \
#     Google_API_KEY= \
#     OPENAI_API_KEY= \
#     OPENROUTER_API_KEY= \
#     DEEPINFRA_API_KEY= \
#     JINA_API_KEY= \
#     MINIO_ENDPOINT=127.0.0.1 \
#     MINIO_PORT=9010 \
#     MINIO_ACCESS_KEY=minioadmin \
#     MINIO_SECRET_KEY=minioadmin \
#     MINIO_BUCKET=user-files \
#     MINIO_USE_SSL=false \
#     LOCAL=False

# # Make port 5000 available to the world outside this container
# EXPOSE 5000

# # Define the command to run the application
# # Note: Ensure 'model.py' is the correct entry point and handles all necessary paths.
# # The OPENAI_API_KEY should be passed during 'docker run' (e.g., -e OPENAI_API_KEY="your_key").
# CMD ["python", "model.py"]






FROM nvidia/cuda:12.2.2-runtime-ubuntu22.04

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PATH="/home/chatllm/.local/bin:${PATH}"

# 1. Install system dependencies as ROOT
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    wget \
    curl \
    git \
    software-properties-common \
    lsb-release \
    gnupg \
    ca-certificates \
    # tesseract-ocr \
    # tesseract-ocr-tha \
    # libtesseract-dev \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    ffmpeg \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    unzip \
    && ln -s /usr/bin/python3 /usr/bin/python \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 2. Install Chrome and ChromeDriver as ROOT
# RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | \
#     gpg --dearmor -o /etc/apt/trusted.gpg.d/google.gpg && \
#     echo "deb [arch=amd64 signed-by=/etc/apt/trusted.gpg.d/google.gpg] http://dl.google.com/linux/chrome/deb/ stable main" \
#     > /etc/apt/sources.list.d/google-chrome.list && \
#     apt-get update && apt-get install -y google-chrome-stable && \
#     CHROME_VERSION=$(google-chrome-stable --version | grep -oP '\d+\.\d+\.\d+\.\d+' || true) && \
#     CHROME_MAJOR_VERSION=$(echo "$CHROME_VERSION" | cut -d'.' -f1 || echo "114") && \
#     CHROMEDRIVER_VERSION=$(wget -qO- "https://chromedriver.storage.googleapis.com/LATEST_RELEASE_$CHROME_MAJOR_VERSION" || echo "114.0.5735.90") && \
#     wget -O /tmp/chromedriver.zip "https://chromedriver.storage.googleapis.com/${CHROMEDRIVER_VERSION}/chromedriver_linux64.zip" && \
#     unzip /tmp/chromedriver.zip -d /usr/local/bin && \
#     chmod +x /usr/local/bin/chromedriver && \
#     rm /tmp/chromedriver.zip && \
#     rm -rf /var/lib/apt/lists/*

# 3. Create non-root user and setup directories
RUN groupadd -r chatllm && \
    useradd -r -g chatllm -m -d /home/chatllm -s /bin/bash chatllm && \
    mkdir -p /app /app/managed_files /home/chatllm/.config/matplotlib /tmp/matplotlib && \
    chown -R chatllm:chatllm /app /home/chatllm /tmp/matplotlib

# Set working directory
WORKDIR /app

COPY ca-bundle.crt .

# Copy the requirements file into the container at /app
COPY ./requirements.txt .

# Install Python dependencies from requirements.txt
RUN pip install --no-cache-dir --ignore-installed -r requirements.txt

# 4. SWITCH TO NON-ROOT USER
USER chatllm

# 5. Copy requirements and install via PIP as USER
# Note: --user is implied when running as non-root, and we added the path to ENV PATH above
# COPY --chown=chatllm:chatllm ./requirements.txt .
# RUN pip install --no-cache-dir --user -r requirements.txt

# 6. Copy the rest of the application
COPY --chown=chatllm:chatllm ./ /app/

# Environment variables for the app
ENV MPLCONFIGDIR=/home/chatllm/.config/matplotlib \
    HOME=/home/chatllm \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility,graphics \
    DATABASE_URL=postgres://athip:123456@llm-chatbot-with-agent-postgresql:5432/ai_agent \
    PGDATABASE=ai_agent \
    PGUSER=athip \
    PGPASSWORD=123456 \
    PGHOST=llm-chatbot-with-agent-postgresql \
    PGPORT=5432 \
    API_SERVER_URL=http://llm-chatbot-with-agent-api-server:5000 \
    API_OLLAMA=http://llm-chatbot-with-agent-ollama:11434/api/generate \
    API_APP=http://llm-chatbot-with-agent-core:3000 \
    MINIO_ENDPOINT=llm-chatbot-with-agent-minio \
    MINIO_PORT=9000 \
    MINIO_ACCESS_KEY=minioadmin \
    MINIO_SECRET_KEY=minioadmin \
    MINIO_BUCKET=user-files \
    MINIO_USE_SSL=false \
    IS_DOCKER=true \
    LOCAL=False \
    IFXGPT=True \
    IFXGPT_CERT_PATH=/app/ca-bundle.crt \
    NODE_EXTRA_CA_CERTS=/app/ca-bundle.crt \
    WINDOWS_USER=yuthaworawit \
    WINDOWS_PASSWORD="Gao Gao2546"

EXPOSE 5000

# CMD ["python", "model.py"]
# CMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app", "--workers=2", "--threads=4", "--timeout=86400"]
CMD ["gunicorn", ",model:app", "-b", "0.0.0.0:5000", "--workers", "1", "--threads", "4", "--timeout", "86400", "--graceful-timeout", "30", "--keep-alive", "5", "--max-requests", "300", "--max-requests-jitter", "50"]