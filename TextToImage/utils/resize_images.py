import os
from PIL import Image
import tqdm

input_folder = './data/104Flower'
output_folder = './data/104Flower_resized/0'
new_size = (64*2, 64*2)  # Change this to the desired size

if not os.path.exists(output_folder):
    os.makedirs(output_folder)

def get_file_path(input_folder):
    for root, dirs, files in os.walk(input_folder):
        for file in files:
            yield os.path.join(root, file) , file

for file_path , file_name in tqdm.tqdm(get_file_path(input_folder)):
    if file_path.endswith(('.png', '.jpg', '.jpeg')):
        img = Image.open(file_path)
        img_resized = img.resize(new_size)
        # output_path = file_path.replace(input_folder, output_folder)
        # output_dir = os.path.dirname(output_path)
        # if not os.path.exists(output_dir):
        #     os.makedirs(output_dir)
        # img_resized.save(output_path)
        img_resized.save(output_folder + '/' + file_name)

# for folder in get_floder(input_folder):
    
#     path = os.path.join(input_folder, filename)
#     if filename.endswith(('.png', '.jpg', '.jpeg')):
#         img_path = os.path.join(input_folder, filename)
#         img = Image.open(img_path)
#         img_resized = img.resize(new_size)
#         img_resized.save(os.path.join(output_folder, filename))

# print("All images have been resized and saved to", output_folder)