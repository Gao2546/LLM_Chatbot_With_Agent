# grounding_dino_api.py

import requests
import torch
from PIL import Image
from typing import List, Dict, Any, Tuple
from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection

# Model choice: 'grounding-dino-tiny' is fast, 'grounding-dino-base' is more accurate.
MODEL_ID = "IDEA-Research/grounding-dino-tiny"

if torch.cuda.is_available():
    DEVICE = "cuda"
elif torch.backends.mps.is_available(): # For Apple Silicon GPUs
    DEVICE = "mps"
else:
    DEVICE = "cpu"

# Global variables to cache the model and processor
_processor = None
_model = None

def load_grounding_dino_model():
    """Loads and caches the Grounding DINO model and processor."""
    global _processor, _model
    if _model is None:
        print(f"Loading Grounding DINO model: {MODEL_ID} on device: {DEVICE}")
        try:
            _processor = AutoProcessor.from_pretrained(MODEL_ID)
            _model = AutoModelForZeroShotObjectDetection.from_pretrained(MODEL_ID).to(DEVICE)
        except Exception as e:
            print(f"Error loading Grounding DINO model: {e}")
            _model = None
    return _processor, _model

def detect_objects_from_url(
    image_url: str, 
    text_labels: List[str], 
    box_threshold: float = 0.4, 
    text_threshold: float = 0.3
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Performs zero-shot object detection using Grounding DINO.

    Args:
        image_url: URL of the image to process.
        text_labels: List of text phrases (e.g., ["a cat", "a remote control"]).
        box_threshold: Minimum confidence for a bounding box.
        text_threshold: Minimum confidence for the text label match.

    Returns:
        A tuple containing:
        - List of detection results (box, score, label).
        - An error message string (empty if successful).
    """
    processor, model = load_grounding_dino_model()
    if model is None:
        return [], "Failed to load Grounding DINO model."

    try:
        # Fetch image
        image = Image.open(requests.get(image_url, stream=True).raw).convert("RGB")
    except Exception as e:
        return [], f"Failed to fetch or open image from URL: {e}"

    # Prepare labels for the model (requires List[List[str]] format)
    # The model works best when the text prompts are short and descriptive.
    # e.g., [['a cat . a remote control .']]
    # We join them into a single string for better performance and format
    # expected by the model when running multiple phrases.
    text_labels_formatted = [[". ".join(text_labels) + " ."]]

    try:
        inputs = processor(images=image, text=text_labels_formatted, return_tensors="pt").to(model.device)
        
        with torch.no_grad():
            outputs = model(**inputs)

        # Post-processing
        target_sizes = [image.size[::-1]] # (Height, Width)
        results = processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            threshold=box_threshold,
            text_threshold=text_threshold,
            target_sizes=target_sizes
        )

        result = results[0]
        detections = []
        for box, score, label in zip(result["boxes"], result["scores"], result["labels"]):
            detections.append({
                "box": [round(x, 2) for x in box.tolist()],
                "score": round(score.item(), 3),
                # The label here is a substring of the combined text, e.g., 'a cat'
                "label": label.strip()
            })

        return detections, ""

    except Exception as e:
        return [], f"An error occurred during Grounding DINO inference: {e}"
    

def detect_objects_from_image_bytes(
    image_bytes: bytes, 
    text_labels: List[str], 
    box_threshold: float = 0.4, 
    text_threshold: float = 0.3
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Performs zero-shot object detection using Grounding DINO on image bytes.

    Args:
        image_bytes: Raw bytes of the image file (e.g., from request.files['file'].read()).
        text_labels: List of text phrases (e.g., ["a cat", "a remote control"]).
        box_threshold: Minimum confidence for a bounding box.
        text_threshold: Minimum confidence for the text label match.

    Returns:
        A tuple containing:
        - List of detection results (box, score, label).
        - An error message string (empty if successful).
    """
    processor, model = load_grounding_dino_model()
    if model is None:
        return [], "Failed to load Grounding DINO model."

    try:
        # Load image from bytes using PIL/io.BytesIO
        from io import BytesIO
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as e:
        return [], f"Failed to open image from bytes: {e}"

    # Prepare labels for the model (joining phrases)
    text_labels_formatted = [[". ".join(text_labels) + " ."]]

    try:
        inputs = processor(images=image, text=text_labels_formatted, return_tensors="pt").to(model.device)
        
        with torch.no_grad():
            outputs = model(**inputs)

        # Post-processing
        target_sizes = [image.size[::-1]] # (Height, Width)
        results = processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            threshold=box_threshold,
            text_threshold=text_threshold,
            target_sizes=target_sizes
        )

        result = results[0]
        detections = []
        for box, score, label in zip(result["boxes"], result["scores"], result["labels"]):
            detections.append({
                "box": [round(x, 2) for x in box.tolist()],
                "score": round(score.item(), 3),
                "label": label.strip()
            })

        return detections, ""

    except Exception as e:
        return [], f"An error occurred during Grounding DINO inference: {e}"