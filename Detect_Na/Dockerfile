# Detect_Na Flask Dashboard - Dockerfile for OpenShift (UBI9)
FROM registry.access.redhat.com/ubi9/python-312:latest

USER 0
RUN mkdir -p /app && chown 1001:0 /app && chmod 775 /app

# Install Tesseract OCR and OpenCV system deps
RUN dnf install -y tesseract && dnf clean all

USER 1001
WORKDIR /app

# Copy requirements and install Python deps
COPY requirements.txt ./
# Use opencv-python-headless for containers (no GUI needed)
RUN sed -i 's/opencv-python==/opencv-python-headless==/' requirements.txt && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY 3_simple.py event_tracker.py pipeline.py realtime_monitor.py seed_db.py ./
COPY dashboard/ ./dashboard/

# Create data directories (will be empty, real data via PVC or runtime)
RUN mkdir -p data_merged data_error data_full_green roi_results wafer_analysis error_analysis_simple

# Environment variables for DB connection (override in OpenShift)
ENV DB_HOST=llm-chatbot-with-agent-postgresql \
    DB_PORT=5432 \
    DB_NAME=ai_agent \
    DB_USER=athip \
    DB_PASSWORD=123456 \
    TESSERACT_CMD=/usr/bin/tesseract \
    PORT=5001 \
    HOST=0.0.0.0

EXPOSE 5001

WORKDIR /app/dashboard/backend
CMD ["python", "app.py"]
