import os
import torch
import datetime
from torch.utils.data import DataLoader
from torch import nn
from torchvision import datasets,transforms
import torch.nn.functional as F
import matplotlib.pyplot as plt
# from IPython.display import clear_output
from torch import optim
import math
import tqdm
import numpy as np
import gc
from torch.cuda import amp
from mpl_toolkits.axes_grid1 import ImageGrid
import tqdm
import time
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

import torch.nn.functional as F
step_sampling = 1000

def linear_beta_schedule(timesteps, start=0.0001, end=0.02):
    scale = step_sampling / timesteps
    start = scale*start
    end   = scale*end
    return torch.linspace(start, end, timesteps)

# def cosine_beta_schedule(timestep, initial_lr = 0.0001, final_lr = 0.02):
#     return final_lr + 0.5 * (initial_lr - final_lr) * (1 + torch.cos(math.pi * torch.linspace(0, timestep,timestep)))

def cosine_beta_schedule(num_timesteps, s=0.008):
  def f(t):
    return torch.cos((t / num_timesteps + s) / (1 + s) * 0.5 * torch.pi) ** 2
  x = torch.linspace(0, num_timesteps, num_timesteps + 1)
  alphas_cumprod = f(x) / f(torch.tensor([0]))
  betas = 1 - alphas_cumprod[1:] / alphas_cumprod[:-1]
  betas = torch.clip(betas, 0.0001, 0.999)
  return betas

def get_index_from_list(vals, t, x_shape):
    """
    Returns a specific index t of a passed list of values vals
    while considering the batch dimension.
    """
    batch_size = t.shape[0]
    out = vals.gather(-1, t.cpu())
    return out.reshape(batch_size, *((1,) * (len(x_shape) - 1))).to(t.device)

def forward_diffusion_sample(x_0, t, device="cpu"):
    """
    Takes an image and a timestep as input and
    returns the noisy version of it
    """
    noise = torch.randn_like(x_0)
    sqrt_alphas_cumprod_t = get_index_from_list(sqrt_alphas_cumprod, t, x_0.shape)
    sqrt_one_minus_alphas_cumprod_t = get_index_from_list(
        sqrt_one_minus_alphas_cumprod, t, x_0.shape
    )
    # mean + variance
    return sqrt_alphas_cumprod_t.to(device) * x_0.to(device) \
    + sqrt_one_minus_alphas_cumprod_t.to(device) * noise.to(device), noise.to(device)


# Define beta schedule
T = step_sampling
betas = linear_beta_schedule(timesteps=T)
# betas = cosine_beta_schedule(num_timesteps=T)

# Pre-calculate different terms for closed form
alphas = 1. - betas
alphas_cumprod = torch.cumprod(alphas, axis=0)
alphas_cumprod_prev = F.pad(alphas_cumprod[:-1], (1, 0), value=1.0)
sqrt_recip_alphas = 1.0/torch.sqrt(alphas)
sqrt_alphas_cumprod = torch.sqrt(alphas_cumprod)
sqrt_one_minus_alphas_cumprod = torch.sqrt(1. - alphas_cumprod)
posterior_variance = betas * (1. - alphas_cumprod_prev) / (1. - alphas_cumprod)

import torch
import torch.nn.functional as F

def reconstruction_loss(input_data, reconstructed_data, reduction='mean'):

    if reduction == 'none':
        return F.mse_loss(input_data, reconstructed_data, reduction='none')
    else:
        return F.mse_loss(input_data, reconstructed_data, reduction=reduction)

def kl_divergence_loss(mu, logvar):

    return -0.5 * torch.sum(1 + logvar - mu.pow(2) - logvar.exp(), dim=1)

def lvlb_loss(input_data, reconstructed_data, mu, logvar, beta=1.0, reduction='mean'):

    recon_loss = reconstruction_loss(input_data, reconstructed_data, reduction=reduction)
    kl_loss = kl_divergence_loss(mu, logvar)

    if reduction == 'none':
        return recon_loss + beta * kl_loss
    else:
        return recon_loss.mean() + beta * kl_loss.mean()

def get_loss(model, x_0, t, encode_text):
    x_noisy, noise = forward_diffusion_sample(x_0, t, device)
    noise_pred = model(x_noisy,t,encode_text)
    # noise_pred = model(x_noisy, t)
    # return F.mse_loss(noise_pred,noise)
    return reconstruction_loss(input_data=noise,reconstructed_data=noise_pred)

def show_tensor_image_t(image):
    reverse_transforms = transforms.Compose([
        transforms.Lambda(lambda t: (t + 1) / 2),
        transforms.Lambda(lambda t: t.permute(1, 2, 0)), # CHW to HWC
        transforms.Lambda(lambda t: t * 255.),
        transforms.Lambda(lambda t: t.numpy().astype(np.uint8)),
        transforms.ToPILImage(),
    ])

    # Take first image of batch
    if len(image.shape) == 4:
        image = image[0, :, :, :]
    plt.imshow(reverse_transforms(image))
def show_tensor_image(image):
    reverse_transforms = transforms.Compose([
        transforms.Lambda(lambda t: (t + 1) / 2),
        transforms.Resize((256, 256)),  # Resize to 256x256
        transforms.Lambda(lambda t: t.permute(1, 2, 0)), # CHW to HWC
        transforms.Lambda(lambda t: t * 255.),
        transforms.Lambda(lambda t: t.detach().numpy().astype(np.uint8)),
        transforms.ToPILImage(),
    ])

    # Take first image of batch
    if len(image.shape) == 4:
        return reverse_transforms(image[0, :, :, :])
    return reverse_transforms(image)
    # plt.imshow(reverse_transforms(image))
@torch.no_grad()
def sample_timestep(x, t, time_step, Denoise_models, encode_text):
    """
    Calls the model to predict the noise in the image and returns
    the denoised image.
    Applies noise to this image, if we are not in the last step yet.
    """
    betas_t = get_index_from_list(betas, t, x.shape)
    sqrt_one_minus_alphas_cumprod_t = get_index_from_list(
        sqrt_one_minus_alphas_cumprod, t, x.shape
    )
    sqrt_recip_alphas_t = get_index_from_list(sqrt_recip_alphas, t, x.shape)

    # Call model (current image - noise prediction)
    with torch.no_grad():
        pre_noises = Denoise_models(x,t,encode_text)
    # noises = Denoise_models(x, t)
    model_mean = sqrt_recip_alphas_t * (
        x - (betas_t / sqrt_one_minus_alphas_cumprod_t * pre_noises)
    )
    posterior_variance_t = get_index_from_list(posterior_variance, t, x.shape)

    # if t == 0:
    #     # As pointed out by Luis Pereira (see YouTube comment)
    #     # The t's are offset from the t's in the paper
    #     return model_mean
    # else:
    #     noise = torch.randn_like(x)
    #     return model_mean + torch.sqrt(posterior_variance_t) * noise
    noise = torch.randn_like(x) if time_step > 1 else torch.zeros_like(x)
    return model_mean + torch.sqrt(betas_t) * noise
    # return model_mean

def codebook(quant_input,embedding):
    B, C, H, W = quant_input.shape
    quant_input = quant_input.permute(0, 2, 3, 1)
    # print(quant_input.shape)
    quant_input = quant_input.reshape((quant_input.size(0), -1, quant_input.size(-1)))
    # print(quant_input.shape)

    # Compute pairwise distances
    dist = torch.cdist(quant_input, embedding.weight[None, :].repeat((quant_input.size(0), 1, 1)))
    # print(self.embedding.weight[None, :].repeat((quant_input.size(0), 1, 1)).shape)
    # print(dist.shape)

    # Find index of nearest embedding
    min_encoding_indices = torch.argmin(dist, dim=-1)
    # print(min_encoding_indices.shape)

    # Select the embedding weights
    quant_out = torch.index_select(embedding.weight, 0, min_encoding_indices.view(-1))
    quant_out = quant_out.reshape((B, H, W, C)).permute(0, 3, 1, 2)
    return quant_out

@torch.no_grad()
def sample_plot_image(Encode_Decode,Denoise_model,names,size):
    # Sample noise
    img_size = size#//(2**2)#IMG_SIZE
    sample_batch = 32
    img = torch.randn((sample_batch, 4, img_size, img_size), device=device)
    
    print(img.max(),img.min())
    # plt.figure(figsize=(15,15))
    # plt.axis('off')
    # num_images = 10
    # stepsize = int(T/num_images)
    embedding_weights = Encode_Decode.embedding.weight.data
    max_weight = torch.max(embedding_weights)
    min_weight = torch.min(embedding_weights)
    print(f"Max weight: {max_weight}, Min weight: {min_weight}")
    # return 0

    for time_step in tqdm.tqdm(range(1,step_sampling)[::-1]):
        t = torch.ones(sample_batch,device=device, dtype=torch.long) * time_step
        img = sample_timestep(img, t , time_step, Denoise_model)
        # Edit: This is to maintain the natural range of the distribution
    print(img.min(),img.max())
    # img = torch.clamp(img, -1.0, 1.0)
    img = codebook(img,Encode_Decode.embedding)
    # print(img.min(),img.max())
    with torch.no_grad():
        img = Encode_Decode.post_quant_conv(img)
        for dec in Encode_Decode.decode:
            img = dec(img)
        img = Encode_Decode.output_layer(img)
        # img = decode(img)
    img = torch.clamp(img, -1.0, 1.0)
    print(img.min(),img.max())
    fig = plt.figure(1,clear=True)
    grid = ImageGrid(fig,rect=111 ,  # similar to subplot(111)
                     nrows_ncols=(int(sample_batch**0.5), int(sample_batch**0.5)),  # creates 2x2 grid of axes
                     axes_pad=0.1,  # pad between axes in inch.

                     )
    for ax, im in zip(grid, img.to("cpu")):
        # Iterating over the grid returns the Axes.
        ax.imshow(show_tensor_image(im))
    # for im in range(img.size(0)):
    #     plt.subplot(4, 8, im+1)
    #     show_tensor_image(img[im].detach().cpu())
    # plt.show()
    plt.savefig(f"TextToImage/output/sample_{names}_{datetime.datetime.now().strftime('%d_%m_%Y')}.png")

@torch.no_grad()
def sample_plot_image_no_VQVAE(Denoise_model, names, size, CLIP_model,img_c,num_gen):
    # Sample noise
    img_size = size
    img = torch.randn((num_gen, img_c, img_size, img_size), device=device)
    # num_images = 10
    # stepsize = int(step_sampling / num_images)
    descreaption = torch.randint(0, 9, (num_gen,), device=device, dtype=torch.long)
    encode_text = CLIP_model.text_encoding(descreaption)

    for time_step in range(1, step_sampling)[::-1]:
        t = torch.ones(num_gen, device=device, dtype=torch.long) * time_step
        img = sample_timestep(img, t, time_step, Denoise_model, encode_text)
    img = torch.clamp(img, -1.0, 1.0)
    fig = plt.figure(1, clear=True, figsize=(15, 10))
    grid = ImageGrid(fig, rect=111, nrows_ncols=(1, num_gen), axes_pad=0.5)

    for idx, (ax, im) in enumerate(zip(grid, img.to("cpu"))):
        ax.imshow(show_tensor_image(im))
        ax.set_title(f"Label: {descreaption[idx].item()}", fontsize=8)
    plt.savefig(f"TextToImage/output/sample_no_VQVAE_{names}_{datetime.datetime.now().strftime('%d_%m_%Y')}.png")

@torch.no_grad()
def generate_image_no_VQVAE(Denoise_model, CLIP_model, image_size, image_c, prompt, img_url):
    data_path = []
    img_path = []
    prompt = torch.tensor([int(prompts) for prompts in prompt],device=device, dtype=torch.long)
    num_prompt = prompt.size(0)
    encode_text = CLIP_model.text_encoding(prompt)
    img = torch.randn((num_prompt, image_c, image_size, image_size), device=device)
    for time_step in range(1, step_sampling)[::-1]:
        t = torch.ones(num_prompt, device=device, dtype=torch.long) * time_step
        img = sample_timestep(img, t, time_step, Denoise_model, encode_text)
    img = torch.clamp(img, -1.0, 1.0)
    time_U = datetime.datetime.now().strftime('%d_%m_%Y')
    local_dir = "./user_files/"
    os.makedirs(local_dir, exist_ok=True)
    for p,i in zip(prompt.cpu().tolist(),img):
        # plt.imsave(f"./TextToImage/output/{p}_{datetime.datetime.now().strftime('%d_%m_%Y')}.png",show_tensor_image(i.cpu()))

        plt.imsave(f"{local_dir}_{time_U}_{p}.png", show_tensor_image(i.cpu()))
        data_path.append(f"{local_dir}_{time_U}_{p}.png")
        img_path.append(f"{img_url}_{time_U}_{p}.png")
    return img, data_path[0] if len(data_path) == 1 else data_path, img_path[0] if len(img_path) == 1 else img_path

def show_img_VAE(batch,recon,names):
    fig = plt.figure(1,clear=True)
    grid = ImageGrid(fig,rect=111 ,  # similar to subplot(111)
                     nrows_ncols=(4,8 ),  # creates 2x2 grid of axes
                     axes_pad=0.1,  # pad between axes in inch.

                     )
    for ax, im in zip(grid, batch.to("cpu")):
        # Iterating over the grid returns the Axes.
        ax.imshow(show_tensor_image(im))

    fig = plt.figure(2,clear=True)
    grid = ImageGrid(fig,rect=111 ,  # similar to subplot(111)
                     nrows_ncols=(4,8 ),  # creates 2x2 grid of axes
                     axes_pad=0.1,  # pad between axes in inch.

                     )
    for ax, im in zip(grid, recon.to("cpu")):
        # Iterating over the grid returns the Axes.
        ax.imshow(show_tensor_image(im))
    plt.savefig(f"TextToImage/output/VQVAE{names}_{datetime.datetime.now().strftime('%d_%m_%Y')}.png")
    # for im in range(img.size(0)):
    #     plt.subplot(4, 8, im+1)
    #     show_tensor_image(img[im].detach().cpu())
    # plt.show()

class TextEncoding(nn.Module):
    def __init__(self, vocab_size, d_model, max_len):
        super(TextEncoding, self).__init__()
        self.token_embedding = nn.Embedding(vocab_size, d_model//8,)
        self.linear1 = nn.Linear(in_features=d_model//8, out_features=d_model//4)
        self.linear2 = nn.Linear(in_features=d_model//4, out_features=d_model//2)
        self.linear3 = nn.Linear(in_features=d_model//2, out_features=d_model)
        self.relu = nn.ReLU()
        self.max_len = max_len
        # self.position_embedding = nn.Embedding(max_len, d_model)
        self.d_model = d_model

    def forward(self, x):
        # seq_len = x.size(1)
        # positions = torch.arange(0, seq_len, device=x.device).unsqueeze(0)
        token_embeds = self.token_embedding(x)
        token_embeds = self.relu(self.linear1(token_embeds))
        token_embeds = self.relu(self.linear2(token_embeds)) # Shape: [batch_size, seq_len, d_model]
        token_embeds = self.relu(self.linear3(token_embeds))
        # position_embeds = self.position_embedding(positions)
        return token_embeds #+ position_embeds
    
class ImageEncoding(nn.Module):
    def __init__(self, in_channels, d_model):
        super(ImageEncoding, self).__init__()
        self.conv1 = nn.Conv2d(in_channels, d_model//8, kernel_size=3, stride=2, padding=1)
        self.conv2 = nn.Conv2d(d_model//8, d_model//4, kernel_size=3, stride=2, padding=1)
        self.conv3 = nn.Conv2d(d_model//4, d_model//2, kernel_size=3, stride=2, padding=1)
        self.conv4 = nn.Conv2d(d_model//2, d_model//1, kernel_size=3, stride=2, padding=1)
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.batch_norm1 = nn.BatchNorm2d(d_model//8)
        self.batch_norm2 = nn.BatchNorm2d(d_model//4)
        self.batch_norm3 = nn.BatchNorm2d(d_model//2)
        self.batch_norm4 = nn.BatchNorm2d(d_model//1)
        self.relu = nn.ReLU()
        self.flatten = nn.Flatten()

    def forward(self, x):
        x = self.batch_norm1(self.relu(self.conv1(x)))
        x = self.batch_norm2(self.relu(self.conv2(x)))
        x = self.batch_norm3(self.relu(self.conv3(x)))
        x = self.batch_norm4(self.relu(self.conv4(x)))
        x = self.pool(x)
        x = self.flatten(x)
        return x
    

class CLIPLoss(torch.nn.Module):
    def __init__(self, temperature=0.07):
        super().__init__()
        self.temperature = torch.tensor(temperature).to(device)

    def forward(self, image_features, text_features):
        # Normalize features
        image_features = F.normalize(image_features, dim=-1)
        text_features = F.normalize(text_features, dim=-1)

        # Compute cosine similarity
        logits = (image_features @ text_features.T) * torch.exp(self.temperature)

        # Create labels (each image-text pair should match)
        batch_size = image_features.shape[0]
        labels = torch.arange(batch_size, device=image_features.device)

        # Contrastive loss (bidirectional)
        loss_img = F.cross_entropy(logits, labels)
        loss_txt = F.cross_entropy(logits.T, labels)
        
        return (loss_img + loss_txt) / 2
