
# LLM Chatbot With Agent

This project implements a Large Language Model (LLM) based chatbot with agent capabilities. It includes features for file management, web browsing, document processing, and integration with various AI models and tools.

## Features

- **Agent Tools**: Web search, file operations, image generation, code execution, and more.
- **Backend API**: Flask-based server for handling agent requests and file management.
- **Frontend**: Node.js/React application for the chatbot interface.
- **Database**: PostgreSQL with pgvector for vector storage.
- **Object Storage**: MinIO for file storage.
- **LLM Support**: Integration with OpenAI, Ollama, and other models.

## Prerequisites

- Python 3.11
- Node.js (for frontend)
- Docker and Docker Compose
- PostgreSQL (optional, if not using Docker)
- MinIO (optional, if not using Docker)
- Ollama (for local LLM models)

## Setup Instructions

### Method 1: Using Docker Container (Recommended)

This method sets up the entire stack using Docker Compose, including database, object storage, and services.

1. **Clone the repository**:
   ```bash
   git clone <repository_url>
   cd LLM_Chatbot_With_Agent
   ```

2. **Set up the main application stack** (includes database, frontend app, and MinIO):
   ```bash
   docker-compose up --build
   ```
   - The frontend app will be available at `http://localhost:3000`
   - MinIO console at `http://localhost:9090` (admin/minioadmin)

3. **Set up the API server stack** (includes Flask API server and Ollama):
   ```bash
   docker-compose -f docker-compose_api_server.yml up --build
   ```
   - The API server will be available at `http://localhost:5000`
   - Ollama will be accessible internally

4. **Environment Variables**:
   - Update the `.env` files in the respective directories if needed.
   - Default database credentials: user `athip`, password `123456`, db `ai_agent`

### Method 2: Running via Command Line on Host Machine

This method installs dependencies directly on your host machine.

1. **Clone the repository**:
   ```bash
   git clone <repository_url>
   cd LLM_Chatbot_With_Agent
   ```

2. **Install Python 3.11** (if not already installed):
   - On Ubuntu/Debian: `sudo apt update && sudo apt install python3.11 python3.11-venv`
   - On other systems, download from [python.org](https://www.python.org/downloads/)

3. **Set up virtual environment**:
   - Linux: `./installenv.sh`
   - Windows: `installenv.bat`
   - Activate the environment: `source env/bin/activate` (Linux/Mac) or `env\Scripts\activate` (Windows)

4. **Install Python dependencies**:
   ```bash
   pip install -r requirement.txt
   ```

5. **Set up external services**:
   - **PostgreSQL**: Install and create database `ai_agent` with user `athip` and password `123456`.
   - **MinIO**: Install and run MinIO server, accessible at `http://localhost:9000` with credentials `minioadmin/minioadmin`.
   - **Ollama**: Install Ollama and pull required models (e.g., `ollama pull llama2`).

6. **Configure environment variables**:
   - Create a `.env` file in the project root or export variables:
     ```
     DATABASE_URL=postgresql://athip:123456@localhost:5432/ai_agent
     OPENAI_API_KEY=your_openai_api_key_here
     API_OLLAMA=http://localhost:11434/api/generate
     MINIO_ENDPOINT=localhost:9000
     MINIO_ACCESS_KEY=minioadmin
     MINIO_SECRET_KEY=minioadmin
     ```

7. **Run the backend API server**:
   ```bash
   python api_server/model.py
   ```
   - The server will start on `http://localhost:5000`

8. **Run the frontend application**:
   ```bash
   cd ai_agent_core
   npm install
   npm start
   ```
   - The frontend will be available at `http://localhost:3000`

## Usage

- Access the chatbot interface at `http://localhost:3000`
- The agent can perform tasks like file uploads/downloads, web searches, code execution, etc.
- API endpoints are available at `http://localhost:5000` for direct integration.

## Project Structure

- `ai_agent_core/`: Frontend Node.js/React application
- `api_server/`: Flask backend API server
- `api_local_server/`: Local server utilities
- `docker-compose.yml`: Main Docker Compose file
- `docker-compose_api_server.yml`: API server Docker Compose file
- `requirement.txt`: Python dependencies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

[Add license information here]
