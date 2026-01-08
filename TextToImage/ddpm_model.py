import os
import torch
import torch.nn.functional as F
import torch.nn as nn
import torch.optim as optim
import torch.distributed as dist
import torch.multiprocessing as mp
from torch.utils.data import DataLoader, Dataset
from torch.utils.data.distributed import DistributedSampler
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.distributed import init_process_group, destroy_process_group
import random
import numpy as np
import signal
import sys
from torchvision import transforms, datasets

from utils.node import *
from utils.utils import *

# Device setup
device = torch.device("cuda")
world_size = torch.cuda.device_count()  # Number of GPUs

# Function to handle DDP setup
def ddp_setup(rank: int, world_size: int):
    """Setup Distributed Data Parallel (DDP) environment."""
    os.environ["MASTER_ADDR"] = "localhost"
    os.environ["MASTER_PORT"] = "12355"
    torch.cuda.set_device(rank)
    dist.init_process_group(backend="nccl", rank=rank, world_size=world_size)

# Function to set random seed
def set_seed(seed: int = 42):
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    np.random.seed(seed)
    random.seed(seed)

# Function to handle keyboard interrupt
def signal_handler(sig, frame):
    print("Training interrupted by user")
    torch.cuda.empty_cache()
    torch.cuda.synchronize()
    sys.exit(0)

# Function to be run by mp.spawn()
def train_ddp(rank, world_size, train_dataset, batch_size, model_ckp, model_VQVAE, model_CLIP,trainVQVAE,training_CLIP,n_epoch,img_size,image_c,Text_dim,No_VQVAE,n_class):
    """Function to be run by mp.spawn(). This function initializes DDP and starts training."""
    # Initialize DDP
    ddp_setup(rank, world_size)

    sampler = DistributedSampler(train_dataset, num_replicas=world_size, rank=rank, shuffle=True)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, sampler=sampler, drop_last=True, num_workers=4)

    # 🟢 FIX: Move Model to Rank-Specific Device & Wrap with DDP
    if training_CLIP:
        model = CLIPModel(
                vocab_size=n_class,
                d_model=Text_dim,
                max_len=1,
                in_channels=image_c,
                image_d_model=Text_dim,
                load_model_path=model_CLIP,
                data_path=None,
                batch_size=32,
                lr=0.001
            ).to(rank)
        model_size = sum(p.numel() for p in model.text_encoding.parameters() if p.requires_grad) + sum(p.numel() for p in model.image_encoding.parameters() if p.requires_grad)
        print(f"Model size: {model_size} trainable parameters")
    else:
        if No_VQVAE:
            model = diffusion_model_No_VQVAE(
                in_c=image_c, 
                out_c=image_c,
                img_size=img_size,
                st_channel=64, 
                channel_multi=[1, 2, 4], 
                att_channel=64, 
                embedding_time_dim=64, 
                time_exp=256, 
                num_head=4, 
                d_model=32, 
                num_resbox=2, 
                allow_att=[True, True, True], 
                concat_up_down=True, 
                concat_all_resbox=True, 
                load_model_path=model_ckp,
                load_CLIP_path=model_CLIP,
                Text_dim=Text_dim,
                n_class=n_class

            ).to(rank)
            model_size = sum(p.numel() for p in model.model.parameters() if p.requires_grad)
            print(f"Model size: {model_size} trainable parameters")
        else:
            if trainVQVAE:
                model = VQVAETrainer(in_c=image_c, 
                                    out_c=image_c, 
                                    down_sampling_times=1, 
                                    encode_laten_channel=4, 
                                    Z_size= 64*64, #16384, 
                                    load_model_path=model_VQVAE, 
                                    lr=1e-3).to(rank)
                vqvae_size = sum(p.numel() for p in model.vqvae.parameters() if p.requires_grad)
                print(f"Model size: {vqvae_size} trainable parameters")
            else:
                model = diffusion_model(
                    in_c=image_c, 
                    out_c=image_c, 
                    img_size=img_size,
                    st_channel=64, 
                    channel_multi=[1, 2, 4], 
                    att_channel=64, 
                    embedding_time_dim=64, 
                    time_exp=256, 
                    num_head=1*4, 
                    d_model=32*8, 
                    num_resbox=2*2, 
                    allow_att=[True, True, True], 
                    concat_up_down=True, 
                    concat_all_resbox=True, 
                    down_sampling_times=1, 
                    encode_laten_channel=4, 
                    Z_size=64*64,#16384, 
                    load_model_path=model_ckp, 
                    load_model_path_VQVAE=model_VQVAE,
                    load_CLIP_path=model_CLIP,
                    lr=1e-6,
                    Text_dim=Text_dim,
                    n_class=n_class
                ).to(rank)
                model_size = sum(p.numel() for p in model.model.parameters() if p.requires_grad)
                vqvae_size = sum(p.numel() for p in model.vqvae.parameters() if p.requires_grad)
                print(f"Model size: {model_size + vqvae_size} trainable parameters")

        # model = diffusion_model_No_VQVAE(
        #     in_c=3, 
        #     out_c=3,
        #     img_size=img_size,
        #     st_channel=64, 
        #     channel_multi=[1, 2, 4], 
        #     att_channel=64, 
        #     embedding_time_dim=64, 
        #     time_exp=256, 
        #     num_head=4, 
        #     d_model=32, 
        #     num_resbox=2, 
        #     allow_att=[True, True, True], 
        #     concat_up_down=True, 
        #     concat_all_resbox=True, 
        #     load_model_path=model_ckp,
        #     Text_dim=Text_dim
        # ).to(rank)
        # Count model parameters
        # model_size = sum(p.numel() for p in model.model.parameters() if p.requires_grad)
        # print(f"Model size: {model_size} trainable parameters")
    model = DDP(model, device_ids=[rank])

    print(f"Rank {rank}: Model loaded. Starting training...")
    # model.module.train_model(train_loader, num_epochs=n_epoch)
    # model.module.inference("test",img_size)
    model.module.generate([0,1,2,3,4,5,6,7,8,9], img_size)

    dist.destroy_process_group()

def main():
    """Main function that initializes DDP and starts training."""
    signal.signal(signal.SIGINT, signal_handler)

    # Set seed
    seed = 42
    set_seed(seed)

    # Paths
    model_ckp = "TextToImage/model/checkpoint/DDPM_T0.pth"
    model_VQVAE_path = None#"TextToImage/model/checkpoint/VQVAETinyImagesNet200.pth"
    model_CLIP = "TextToImage/model/checkpoint/CLIP0.pth"
    # path_to_data = "TextToImage/data/104Flower_resized"
    path_to_data = "TextToImage/data/tiny-imagenet-200/train"

    # Check if the dataset path exists
    if not os.path.exists(path_to_data):
        print("Downloading and extracting Tiny ImageNet dataset...")
        os.system("apt-get update")
        os.system("apt-get install unzip")
        os.system("wget http://cs231n.stanford.edu/tiny-imagenet-200.zip")
        os.system("unzip tiny-imagenet-200.zip -d ./data")
        os.system("rm -f ./tiny-imagenet-200.zip")
        path_to_data = "./data/tiny-imagenet-200/train"

    # Training setup <====================================
    size = 16 * 4
    image_c = 1
    Text_dim = 512
    No_VQVAE = True
    n_class = 10
    batch_size = 16 * 1
    epochs = 100
    traning_VQVAE = False
    training_CLIP = False
    # ===================================================>

    transform = transforms.Compose([
        transforms.RandomHorizontalFlip(p=0.5),  # Flip images horizontally with 50% chance
        transforms.RandomRotation(15),  # Rotate images by up to ±15 degrees
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.1),  # Adjust color
        transforms.RandomResizedCrop(size, scale=(0.8, 1.0)),  # Randomly crop and resize
        transforms.Resize((size, size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=(0.5, 0.5, 0.5), std=(0.5, 0.5, 0.5))
    ])

    # Load dataset
    # train_dataset = datasets.ImageFolder(root=path_to_data, transform=transform)
    # train_dataset = datasets.CIFAR100(root='/data', train=True, transform=transform, download=True)
    transform = transforms.Compose([transforms.ToTensor()])
    train_dataset = datasets.MNIST(root="TextToImage/data", train=True, transform=transform, download=True)
    n_class = len(train_dataset.classes)
    size, image_c = train_dataset[0][0].shape[1], train_dataset[0][0].shape[0]
    
    print("Data loaded successfully!")

    print("Starting distributed training...")

    # Use mp.spawn() to run training across multiple GPUs
    #mp.spawn(train_ddp, args=(world_size, model_VQVAE, train_dataset, batch_size), nprocs=world_size, join=True)
    mp.spawn(train_ddp, args=(world_size, train_dataset, batch_size, model_ckp, model_VQVAE_path,model_CLIP,traning_VQVAE,training_CLIP,epochs,size,image_c,Text_dim,No_VQVAE,n_class), nprocs=world_size, join=True)

    print("Training completed!")

if __name__ == "__main__":
    main()
