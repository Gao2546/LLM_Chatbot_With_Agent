# Stage 1: Build ai_agent_core
FROM node:22-bookworm AS builder_app

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
COPY public ./public

# RUN npm update @modelcontextprotocol/sdk
RUN npm run build


# Stage 2: Build mcp_BrowserBase
# FROM node:22-bookworm AS builder_mcp

# WORKDIR /mcp

# COPY mcp_BrowserBase/package*.json ./
# RUN npm install

# COPY mcp_BrowserBase/tsconfig.json ./
# COPY mcp_BrowserBase/src ./src
# # Adjust based on your build tool (webpack, tsc, etc.)
# RUN ls -al && npm run build
# RUN npm run build


# Stage 3: Production image
FROM node:22-bookworm

WORKDIR /app

RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y bash

# Setup ai_agent_core
COPY package.json ./
COPY ca-bundle.crt ./
COPY --from=builder_app /app/node_modules ./node_modules
COPY --from=builder_app /app/build ./build
COPY build/setting.txt ./build/setting.txt
COPY scripts ./scripts
COPY --from=builder_app /app/public ./public

# Set environment variables
ENV DATABASE_URL=postgres://athip:123456@llm-chatbot-with-agent-postgresql:5432/ai_agent \
    API_SERVER_URL=http://llm-chatbot-with-agent-api-server:5000 \
    API_OLLAMA=http://llm-chatbot-with-agent-ollama:11434/api/generate \
    Google_API_KEY= \
    OPENAI_API_KEY= \
    OPENROUTER_API_KEY= \
    SITE_URL= \
    SITE_NAME= \
    MINIO_ENDPOINT=llm-chatbot-with-agent-minio \
    MINIO_PORT=9000 \
    MINIO_ACCESS_KEY=minioadmin \
    MINIO_SECRET_KEY=minioadmin \
    MINIO_BUCKET=user-files \
    MINIO_USE_SSL=false \
    PORT=3000 \
    LOCAL=False \
    IFXGPT=True \
    IFXGPT_CERT_PATH=/app/ca-bundle.crt \
    WINDOWS_USER=yuthaworawit \
    WINDOWS_PASSWORD="Gao Gao2546"

# Setup mcp_BrowserBase build output (e.g., dist or build folder)
# Change `/dist` to your actual build output if needed
# COPY --from=builder_mcp /mcp ../mcp_BrowserBase

EXPOSE 3000

CMD ["npm", "start"]