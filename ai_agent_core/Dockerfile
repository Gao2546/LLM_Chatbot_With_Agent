# Stage 1: Build ai_agent_core
FROM node:22-bookworm AS builder_app

WORKDIR /app

COPY ai_agent_core/package*.json ./
RUN npm install

COPY ai_agent_core/tsconfig.json ./
COPY ai_agent_core/src ./src
COPY ai_agent_core/public ./public

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
COPY ai_agent_core/package.json ./
COPY --from=builder_app /app/node_modules ./node_modules
COPY --from=builder_app /app/build ./build
COPY ai_agent_core/build/setting.txt ./build/setting.txt
COPY ai_agent_core/scripts ./scripts
COPY --from=builder_app /app/public ./public

# Setup mcp_BrowserBase build output (e.g., dist or build folder)
# Change `/dist` to your actual build output if needed
# COPY --from=builder_mcp /mcp ../mcp_BrowserBase

EXPOSE 3000

CMD ["npm", "start"]
