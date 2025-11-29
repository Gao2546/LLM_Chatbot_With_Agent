import fitz  # PyMuPDF
import io
import os
from PIL import Image

def extract_images_from_pdf(pdf_path, output_dir):
    """
    Extracts all images from a PDF and saves them to a directory.

    :param pdf_path: Path to the PDF file.
    :param output_dir: Directory to save the extracted images.
    """
    # Create the output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Open the PDF file
    doc = fitz.open(pdf_path)
    image_count = 0
    
    print(f"[*] Opening '{pdf_path}'...")

    # Iterate through each page of the PDF
    for page_index in range(len(doc)):
        page = doc.load_page(page_index)
        
        # get_images() returns a list of image metadata tuples
        image_list = page.get_images(full=True)
        
        if not image_list:
            continue

        print(f"[+] Found {len(image_list)} images on page {page_index + 1}")

        # Iterate through the images found on the page
        for img_index, img in enumerate(image_list, start=1):
            # The xref is a unique identifier for the image within the PDF
            xref = img[0]

            # Extract the raw image bytes
            base_image = doc.extract_image(xref)
            image_bytes = base_image["image"]
            
            # Get the image extension
            image_ext = base_image["ext"]

            # Generate a unique filename for the image
            image_filename = f"image_p{page_index + 1}_{img_index}.{image_ext}"
            image_path = os.path.join(output_dir, image_filename)

            # Save the image
            with open(image_path, "wb") as img_file:
                img_file.write(image_bytes)
            
            print(f"    - Saved image to '{image_path}'")
            image_count += 1

    # Close the document
    doc.close()
    print(f"\n[*] Done. Extracted a total of {image_count} images.")


if __name__ == '__main__':
    # --- USAGE ---
    # Replace with the path to your PDF file
    pdf_file_path = "/home/athip/psu/41/embedded/lab16/LAB16_RTOS-V02-2567.pdf" 
    
    # Replace with the desired folder to save images
    output_folder = "/home/athip/psu/learning_AI/api_server/utils/temp_images"
    
    # Check if the PDF file exists before running
    if os.path.exists(pdf_file_path):
        extract_images_from_pdf(pdf_file_path, output_folder)
    else:
        print(f"Error: The file '{pdf_file_path}' was not found.")