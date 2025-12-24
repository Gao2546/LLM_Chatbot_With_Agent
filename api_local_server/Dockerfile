# Base image
FROM node:18

# Install python3 and venv package
RUN apt-get update && apt-get install -y \
    python3 \
    python3-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create non-root user using build args
# ARG USER_ID=1001
# ARG GROUP_ID=1001

# Use existing group or create new one
# RUN getent group ${GROUP_ID} || groupadd -g ${GROUP_ID} appgroup && \
#     useradd -m -u ${USER_ID} -g ${GROUP_ID} appuser

# Copy files as root
COPY package*.json ./
COPY tsconfig.json ./
COPY /src ./src
COPY /public ./public

# Create and own the files directory
RUN mkdir -p /app/files 
#&& chown -R ${USER_ID}:${GROUP_ID} /app

# RUN chown -R $(USER_ID):$(GROUP_ID) /app/files

RUN ls -l

# Switch to non-root user
# USER appuser

# Install dependencies (as appuser)
RUN npm install

# Compile TypeScript
RUN npm run build

# RUN echo "APP_SERVER=http://ggent.ddns.net:3000" > .env
ENV APP_SERVER=http://llmchatbot:3000

# Expose port
EXPOSE 3333

# Run compiled server
CMD ["node", "build/index.js"]