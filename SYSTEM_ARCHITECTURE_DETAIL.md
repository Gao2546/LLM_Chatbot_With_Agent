# 📚 LLM Chatbot with Agent - System Architecture Documentation

## เอกสารสถาปัตยกรรมระบบฉบับสมบูรณ์

**Version:** 1.0  
**Last Updated:** December 29, 2025

---

## 📑 สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [สถาปัตยกรรมฐานข้อมูล](#2-สถาปัตยกรรมฐานข้อมูล)
3. [ระบบ AI และการสร้างคำตอบ](#3-ระบบ-ai-และการสร้างคำตอบ)
4. [Flow การทำงานหลัก](#4-flow-การทำงานหลัก)
5. [API Endpoints](#5-api-endpoints)
6. [การตั้งค่าและ Environment Variables](#6-การตั้งค่าและ-environment-variables)

---

## 1. ภาพรวมระบบ

### 1.1 Components หลัก

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           LLM Chatbot System                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │   Frontend UI    │───▶│  ai_agent_core   │───▶│   api_server     │   │
│  │  (HTML/JS/CSS)   │    │  (TypeScript)    │    │    (Python)      │   │
│  └──────────────────┘    └────────┬─────────┘    └────────┬─────────┘   │
│                                   │                       │              │
│                                   ▼                       ▼              │
│                          ┌──────────────────────────────────┐           │
│                          │         Data Layer               │           │
│                          │  ┌─────────┐   ┌──────────────┐  │           │
│                          │  │PostgreSQL│   │    MinIO     │  │           │
│                          │  │ (pgvector)│   │(Object Store)│  │           │
│                          │  └─────────┘   └──────────────┘  │           │
│                          └──────────────────────────────────┘           │
│                                                                          │
│                          ┌──────────────────────────────────┐           │
│                          │         AI Services              │           │
│                          │  ┌─────────┐   ┌──────────────┐  │           │
│                          │  │ Ollama  │   │  DeepInfra   │  │           │
│                          │  │ (Local) │   │ OpenRouter   │  │           │
│                          │  └─────────┘   └──────────────┘  │           │
│                          └──────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Frontend** | HTML, CSS, JavaScript | User Interface |
| **Agent Backend** | Node.js, TypeScript, Express | Session, Auth, API Gateway |
| **AI Backend** | Python, Flask | Document Processing, Embedding, RAG |
| **Database** | PostgreSQL + pgvector | Data Storage, Vector Search |
| **Object Storage** | MinIO | File Storage (PDF, Images) |
| **AI Models** | Ollama, DeepInfra, OpenRouter | LLM & VLM Inference |

---

## 2. สถาปัตยกรรมฐานข้อมูล

### 2.1 Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────────┐       ┌─────────────────────────┐
│      users       │       │     chat_history     │       │     uploaded_files      │
├──────────────────┤       ├──────────────────────┤       ├─────────────────────────┤
│ id (PK)          │◄──┐   │ id (PK)              │◄──┐   │ id (PK)                 │
│ username         │   │   │ user_id (FK)─────────┼───┘   │ user_id (FK)────────────┤
│ password         │   │   │ message              │   │   │ chat_history_id (FK)────┤
│ email            │   │   │ chat_mode            │   │   │ file_name               │
│ is_active        │   │   │ chat_model           │   │   │ object_name (MinIO key) │
│ current_chat_id  │   │   │ doc_search_method    │   │   │ mime_type               │
│ role             │   │   │ timestamp            │   │   │ file_size_bytes         │
│ is_guest         │   │   └──────────────────────┘   │   │ active_users[]          │
└──────────────────┘   │                              │   │ file_process_status     │
        │              └──────────────────────────────┤   │ uploaded_at             │
        │                                             │   └─────────────────────────┘
        │                                             │              │
        ▼                                             │              ▼
┌──────────────────────────────┐                      │   ┌─────────────────────────────┐
│    document_embeddings       │                      │   │  document_page_embeddings   │
├──────────────────────────────┤                      │   ├─────────────────────────────┤
│ id (PK)                      │                      │   │ id (PK)                     │
│ user_id (FK)                 │                      │   │ user_id (FK)                │
│ chat_history_id (FK)─────────┼──────────────────────┘   │ chat_history_id (FK)        │
│ uploaded_file_id (FK)        │                          │ uploaded_file_id (FK)       │
│ extracted_text               │                          │ page_number                 │
│ embedding VECTOR(1024)       │                          │ embedding VECTOR(2048)      │
│ page_number                  │                          │ created_at                  │
│ created_at                   │                          └─────────────────────────────┘
└──────────────────────────────┘
```

### 2.2 ตารางหลักและความสัมพันธ์

#### 2.2.1 `users` - ตารางผู้ใช้งาน

```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    current_chat_id INTEGER,
    role VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    is_guest BOOLEAN DEFAULT FALSE
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary Key, Auto-increment |
| `username` | VARCHAR(255) | ชื่อผู้ใช้ (Unique) |
| `password` | VARCHAR(255) | รหัสผ่าน (Hashed) |
| `email` | VARCHAR(255) | อีเมล |
| `is_active` | BOOLEAN | สถานะออนไลน์ |
| `current_chat_id` | INTEGER | Chat ID ปัจจุบันที่กำลังใช้งาน |
| `role` | VARCHAR(10) | บทบาท: 'user' หรือ 'admin' |
| `is_guest` | BOOLEAN | เป็น Guest หรือไม่ |

---

#### 2.2.2 `chat_history` - ประวัติการแชท

```sql
CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    chat_mode VARCHAR(255),
    chat_model VARCHAR(255),
    doc_search_method VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_chat_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary Key |
| `user_id` | INTEGER | FK → users.id |
| `message` | TEXT | เนื้อหาการสนทนาทั้งหมด |
| `chat_mode` | VARCHAR(255) | โหมด: 'code', 'ask' |
| `chat_model` | VARCHAR(255) | โมเดล AI ที่ใช้ |
| `doc_search_method` | VARCHAR(255) | วิธีค้นหาเอกสาร: 'none', 'searchDoc', 'searchdocAll' |

---

#### 2.2.3 `uploaded_files` - ไฟล์ที่อัปโหลด

```sql
CREATE TABLE IF NOT EXISTS uploaded_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    chat_history_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    object_name TEXT UNIQUE NOT NULL,  -- MinIO Object Key
    mime_type VARCHAR(255),
    file_size_bytes BIGINT,
    active_users INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    file_process_status TEXT DEFAULT 'process',
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_file_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_file_chat FOREIGN KEY (chat_history_id) REFERENCES chat_history(id) ON DELETE CASCADE
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary Key |
| `user_id` | INTEGER | FK → users.id |
| `chat_history_id` | INTEGER | FK → chat_history.id (`-1` = Knowledge Base) |
| `file_name` | TEXT | ชื่อไฟล์เดิม |
| `object_name` | TEXT | Key ใน MinIO: `user_{id}/chat_{id}/{timestamp}-{filename}` |
| `mime_type` | VARCHAR(255) | ประเภทไฟล์ |
| `file_size_bytes` | BIGINT | ขนาดไฟล์ |
| `active_users` | INTEGER[] | Array ของ user_id ที่เข้าถึงได้ |
| `file_process_status` | TEXT | สถานะ: 'process', 'finish', 'error' |

---

#### 2.2.4 `document_embeddings` - Text Embeddings (Legacy)

```sql
CREATE TABLE IF NOT EXISTS document_embeddings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    chat_history_id INTEGER NOT NULL,
    uploaded_file_id INTEGER NOT NULL,
    extracted_text TEXT,
    embedding VECTOR(1024),        -- 1024 dimensions
    page_number INTEGER DEFAULT -1,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_doc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_chat FOREIGN KEY (chat_history_id) REFERENCES chat_history(id) ON DELETE CASCADE,
    CONSTRAINT fk_doc_file FOREIGN KEY (uploaded_file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary Key |
| `extracted_text` | TEXT | ข้อความที่ดึงออกจากไฟล์ |
| `embedding` | VECTOR(1024) | Text Embedding Vector (Jina v4 / Qwen3-Embedding) |
| `page_number` | INTEGER | หน้าที่ (-1 = ทั้งเอกสาร) |

**ใช้สำหรับ:** ไฟล์ที่มีจำนวนหน้า ≤ 5 หน้า (Text-based RAG)

---

#### 2.2.5 `document_page_embeddings` - Image Embeddings (New)

```sql
CREATE TABLE IF NOT EXISTS document_page_embeddings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    chat_history_id INTEGER NOT NULL,
    uploaded_file_id INTEGER NOT NULL,
    page_number INTEGER NOT NULL,
    embedding VECTOR(2048),        -- 2048 dimensions
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_page_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_page_chat FOREIGN KEY (chat_history_id) REFERENCES chat_history(id) ON DELETE CASCADE,
    CONSTRAINT fk_page_file FOREIGN KEY (uploaded_file_id) REFERENCES uploaded_files(id) ON DELETE CASCADE
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary Key |
| `page_number` | INTEGER | หน้าที่ (1-indexed) |
| `embedding` | VECTOR(2048) | Image Embedding Vector (Jina v4 Multimodal) |

**ใช้สำหรับ:** ไฟล์ที่มีจำนวนหน้า > 5 หน้า (Image-based RAG / Multimodal)

---

### 2.3 ตาราง Verified Answers (Q&A Community)

#### 2.3.1 `verified_answers` - คำถาม-คำตอบที่ยืนยันแล้ว

```sql
CREATE TABLE IF NOT EXISTS verified_answers (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    tags TEXT[],
    verification_type VARCHAR(50) DEFAULT 'staging',
    question_embedding VECTOR(1024),
    answer_embedding VECTOR(1024),
    views INT DEFAULT 0,
    requested_departments TEXT[],
    notify_me BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    last_updated_at TIMESTAMP DEFAULT NOW()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `question` | TEXT | คำถาม |
| `answer` | TEXT | คำตอบ |
| `tags` | TEXT[] | แท็ก (Array) |
| `verification_type` | VARCHAR(50) | ประเภท: 'self' (ตอบเอง), 'verification' (ยืนยันแล้ว), 'request' (ขอยืนยัน) |
| `question_embedding` | VECTOR(1024) | Embedding ของคำถาม |
| `answer_embedding` | VECTOR(1024) | Embedding ของคำตอบ |
| `views` | INT | จำนวนการเข้าดู |
| `requested_departments` | TEXT[] | แผนกที่ขอยืนยัน |
| `notify_me` | BOOLEAN | เปิดการแจ้งเตือน |
| `created_by` | VARCHAR(255) | ผู้สร้าง |

---

#### 2.3.2 `answer_verifications` - การยืนยันคำตอบ

```sql
CREATE TABLE IF NOT EXISTS answer_verifications (
    id SERIAL PRIMARY KEY,
    verified_answer_id INT NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    user_id INT,
    comment TEXT,
    commenter_name VARCHAR(255),
    verification_type VARCHAR(50) DEFAULT 'self',
    requested_departments TEXT[],
    attachments JSONB DEFAULT '[]'::jsonb,
    due_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(verified_answer_id, user_id)
);
```

| Column | Type | Description |
|--------|------|-------------|
| `verified_answer_id` | INT | FK → verified_answers.id |
| `user_id` | INT | ผู้ยืนยัน |
| `comment` | TEXT | ความคิดเห็น |
| `commenter_name` | VARCHAR(255) | ชื่อผู้ยืนยัน |
| `verification_type` | VARCHAR(50) | 'self' (ตอบเอง), 'verification' (ยืนยันแล้ว), 'request' (ขอยืนยัน) |
| `attachments` | JSONB | ไฟล์แนบ (Array of URLs) |

---

### 2.4 Vector Search Queries

#### การค้นหา Text Embeddings (L2 Distance)

```sql
-- ค้นหาเอกสารที่คล้ายกันในแชทเดียวกัน
SELECT 
    t1.id AS page_embedding_id, 
    t2.file_name, 
    t2.object_name,
    t1.page_number,
    t1.extracted_text,
    t1.embedding <-> '[0.1, 0.2, ...]' AS distance  -- L2 Distance
FROM document_embeddings AS t1
INNER JOIN uploaded_files AS t2 ON t1.uploaded_file_id = t2.id
WHERE t2.user_id = 1
    AND t2.chat_history_id = 123
    AND (t1.embedding <-> '[0.1, 0.2, ...]') <= 0.5  -- Threshold
ORDER BY distance
LIMIT 5;
```

#### การค้นหา Image Page Embeddings

```sql
-- ค้นหาหน้าเอกสารที่คล้ายกัน
SELECT 
    t1.id AS page_embedding_id, 
    t2.file_name, 
    t2.object_name,
    t1.page_number,
    t1.embedding <-> '[0.1, 0.2, ...]' AS distance
FROM document_page_embeddings AS t1
INNER JOIN uploaded_files AS t2 ON t1.uploaded_file_id = t2.id
WHERE t2.user_id = 1 
  AND t2.chat_history_id = 123
  AND (t1.embedding <-> '[0.1, 0.2, ...]') <= 1.0
ORDER BY distance
LIMIT 5;
```

#### การค้นหาตาม Active Users (Knowledge Base)

```sql
-- ค้นหาจากไฟล์ที่ user มีสิทธิ์เข้าถึง
SELECT 
    t1.id, t2.file_name, t1.extracted_text,
    t1.embedding <-> '[...]' AS distance
FROM document_embeddings AS t1
INNER JOIN uploaded_files AS t2 ON t1.uploaded_file_id = t2.id
WHERE 1 = ANY(t2.active_users)  -- User ID 1 อยู่ใน active_users array
  AND (t1.embedding <-> '[...]') <= 0.5
ORDER BY distance
LIMIT 5;
```

---

## 3. ระบบ AI และการสร้างคำตอบ

### 3.1 AI Models ที่ใช้งาน

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI Models Architecture                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                      Embedding Models                          │     │
│  ├────────────────────────────────────────────────────────────────┤     │
│  │                                                                 │     │
│  │  ┌─────────────────────┐    ┌─────────────────────┐           │     │
│  │  │ Text Embedding      │    │ Image Embedding     │           │     │
│  │  │ (1024 dimensions)   │    │ (2048 dimensions)   │           │     │
│  │  ├─────────────────────┤    ├─────────────────────┤           │     │
│  │  │ • Jina v4           │    │ • Jina v4 Multi-    │           │     │
│  │  │ • Qwen3-Embedding   │    │   modal             │           │     │
│  │  │   (0.6B/4B)         │    │ • CLIP-based        │           │     │
│  │  └─────────────────────┘    └─────────────────────┘           │     │
│  │                                                                 │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                      Generation Models (LLM/VLM)               │     │
│  ├────────────────────────────────────────────────────────────────┤     │
│  │                                                                 │     │
│  │  ┌─────────────────────┐    ┌─────────────────────┐           │     │
│  │  │ LOCAL (Ollama)      │    │ REMOTE (API)        │           │     │
│  │  ├─────────────────────┤    ├─────────────────────┤           │     │
│  │  │ • gemma3:4b         │    │ • Qwen2.5-VL-32B    │           │     │
│  │  │ • qwen3-vl:4b       │    │ • Qwen3-235B        │           │     │
│  │  │ • llava             │    │ • Gemini 2.0 Flash  │           │     │
│  │  └─────────────────────┘    └─────────────────────┘           │     │
│  │                                                                 │     │
│  └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Embedding Generation Pipeline

#### 3.2.1 Text Embedding Process

```python
def encode_text_for_embedding(text: str, target_dimensions: int = 1024) -> list[float]:
    """
    แปลงข้อความเป็น Embedding Vector
    
    Flow:
    1. ตรวจสอบ text ไม่ว่าง
    2. ถ้ามี DEEPINFRA_API_KEY และไม่ใช่ LOCAL → ใช้ DeepInfra API
    3. ถ้า LOCAL → ใช้ Ollama (qwen3-embedding:0.6b)
    4. Fallback → ใช้ Local SentenceTransformer
    """
    
    # DeepInfra API (Remote)
    if os.getenv("DEEPINFRA_API_KEY") and not LOCAL:
        embeddings_list = DeepInfraEmbedding(
            inputs=[text],
            model_name="Qwen/Qwen3-Embedding-4B"
        )
        return embeddings_list[0]  # 1024 dimensions
    
    # Ollama (Local)
    else:
        embeddings_list = ollama_embed_text(
            text=text, 
            model="qwen3-embedding:0.6b"
        )
        return embeddings_list[0]  # 1024 dimensions
```

#### 3.2.2 Image/Multimodal Embedding Process

```python
def get_image_embedding_jinna_api_local(
    text: str = None, 
    image_bytes_list: List[bytes] = None
) -> Union[List[float], List[List[float]]]:
    """
    สร้าง Embedding สำหรับ Text หรือ Images ผ่าน Jina v4
    
    Flow สำหรับ Text (HyDE - Hypothetical Document Embeddings):
    1. สร้าง prompt ให้ LLM สร้างเอกสารสมมติที่ตอบคำถาม
    2. ส่งเอกสารสมมติไป encode เป็น embedding
    
    Flow สำหรับ Images:
    1. แปลง bytes → PIL Images
    2. ส่งไป encode ด้วย model.encode()
    """
    
    # Text Input (with HyDE)
    if text:
        create_search_prompt = f"""
        Act as a document search engine. 
        Based on the user's query below, generate a detailed paragraph 
        describing the content likely to appear on a document page.
        
        User Query: {text}
        """
        
        # สร้างเอกสารสมมติด้วย LLM
        if LOCAL:
            search_text = ollama_generate_text(
                prompt=create_search_prompt,
                model="gemma3:4b"
            )
        else:
            search_text = DeepInfraInference(
                prompt=create_search_prompt,
                model_name="Qwen/Qwen3-235B-A22B-Instruct-2507"
            )
        
        # Encode เอกสารสมมติ
        with torch.no_grad():
            embedding = model.encode(
                [search_text], 
                task="retrieval",
                convert_to_numpy=True
            )
        return embedding[0].tolist()  # 2048 dimensions
    
    # Image Input
    elif image_bytes_list:
        pil_images = [Image.open(io.BytesIO(b)) for b in image_bytes_list]
        
        with torch.no_grad():
            embeddings = model.encode(
                pil_images,
                batch_size=1, 
                convert_to_numpy=True
            )
        return embeddings.tolist()  # List of 2048-dim vectors
```

### 3.3 RAG (Retrieval-Augmented Generation) Pipeline

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                            RAG Pipeline Flow                                    │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  User Query: "วงจร 7-segment ต่อกับ Arduino อย่างไร?"                           │
│       │                                                                         │
│       ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │ Step 1: Query Enhancement (HyDE)                                    │       │
│  │                                                                      │       │
│  │ LLM สร้างเอกสารสมมติ:                                                │       │
│  │ "A document page showing Arduino circuit connections to 7-segment   │       │
│  │  display with pin assignments A-G, resistor values 300-ohm,         │       │
│  │  common cathode configuration..."                                   │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│       │                                                                         │
│       ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │ Step 2: Embedding Generation                                        │       │
│  │                                                                      │       │
│  │ Query Embedding (2048-dim) ← Jina v4 Multimodal                     │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│       │                                                                         │
│       ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │ Step 3: Vector Similarity Search (pgvector)                         │       │
│  │                                                                      │       │
│  │ SELECT * FROM document_page_embeddings                              │       │
│  │ WHERE embedding <-> query_vector <= threshold                       │       │
│  │ ORDER BY distance LIMIT 5                                           │       │
│  │                                                                      │       │
│  │ Results: [page_1.pdf:3, page_2.pdf:7, ...]                         │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│       │                                                                         │
│       ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │ Step 4: Retrieve Page Images from MinIO                             │       │
│  │                                                                      │       │
│  │ for result in search_results:                                       │       │
│  │     image_bytes = minio.get_object(result.object_name)              │       │
│  │     page_images.append(convert_pdf_page_to_image(page_num))         │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│       │                                                                         │
│       ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │ Step 5: VLM Processing (Generate Answer)                            │       │
│  │                                                                      │       │
│  │ VLM Prompt:                                                         │       │
│  │ "Based on these document pages, answer the user's question:         │       │
│  │  วงจร 7-segment ต่อกับ Arduino อย่างไร?"                             │       │
│  │                                                                      │       │
│  │ + [Image 1] + [Image 2] + [Image 3]                                │       │
│  │                                                                      │       │
│  │ Model: Qwen2.5-VL-32B-Instruct (DeepInfra)                         │       │
│  │     OR qwen3-vl:4b (Ollama Local)                                  │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│       │                                                                         │
│       ▼                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐       │
│  │ Step 6: Return Answer to User                                       │       │
│  │                                                                      │       │
│  │ "ตามเอกสารที่พบ วงจร 7-segment ต่อกับ Arduino ดังนี้:                │       │
│  │  - Pin A0-A5 ต่อผ่านตัวต้านทาน 300Ω ไปยัง segment A-F              │       │
│  │  - Pin 8 ต่อผ่านตัวต้านทาน 300Ω ไปยัง segment G                    │       │
│  │  - Common cathode ต่อ GND..."                                       │       │
│  └─────────────────────────────────────────────────────────────────────┘       │
│                                                                                 │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 VLM Processing Function

```python
def process_pages_with_vlm(
    search_results: List[Dict],
    original_query: str,
    use_ollama: bool = False,
    ollama_model: str = 'llava',
    deepinfra_model: str = 'Qwen/Qwen2.5-VL-32B-Instruct'
) -> str:
    """
    ประมวลผลหน้าเอกสารด้วย VLM เพื่อสร้างคำตอบ
    
    Args:
        search_results: ผลลัพธ์จาก vector search
        original_query: คำถามเดิมของผู้ใช้
        use_ollama: ใช้ Ollama (Local) หรือไม่
        
    Returns:
        str: คำตอบที่สร้างจาก VLM
    """
    
    # 1. Fetch page images from MinIO
    image_bytes_list = []
    for result in search_results:
        object_name = result['object_name']
        page_number = result['page_number']
        
        # Get PDF from MinIO
        pdf_bytes = minio_client.get_object(bucket, object_name)
        
        # Convert specific page to image
        page_image = convert_pdf_page_to_image(pdf_bytes, page_number - 1)
        image_bytes_list.append(page_image)
    
    # 2. Build VLM prompt
    system_prompt = """
    You are a document analysis expert. Based on the provided document pages,
    answer the user's question accurately. Extract relevant information from
    the images and provide a comprehensive answer.
    """
    
    user_prompt = f"""
    Please analyze these {len(image_bytes_list)} document pages and answer:
    
    Question: {original_query}
    
    Provide a detailed answer based on the content shown in the images.
    """
    
    # 3. Call VLM
    if use_ollama or LOCAL:
        # Local Ollama
        response = ollama_describe_image(
            image_bytes=image_bytes_list,
            model=ollama_model,
            prompt=user_prompt,
            system_prompt=system_prompt
        )
    else:
        # DeepInfra API
        response = DeepInfraInference(
            prompt=user_prompt,
            system_prompt=system_prompt,
            image_bytes_list=image_bytes_list,
            model_name=deepinfra_model
        )
    
    return response
```

### 3.5 Document Search Methods

| Method | Description | Use Case |
|--------|-------------|----------|
| `none` | ค้นหาเฉพาะใน chat ปัจจุบัน | การสนทนาทั่วไป |
| `searchDoc` | ค้นหาจากไฟล์ที่ user มีสิทธิ์ (active_users) | Knowledge Base ส่วนตัว |
| `searchdocAll` | ค้นหาจากไฟล์ทั้งหมดใน Knowledge Base (chat_id = -1) | Global Knowledge Base |

```python
@app.route('/search_similar', methods=['POST'])
def search_similar_api_unified():
    """
    Unified Search Endpoint
    """
    document_search_method = data.get('documentSearchMethod', 'none')
    
    if document_search_method == 'searchDoc':
        # ค้นหาจากไฟล์ที่ user มีสิทธิ์
        legacy_results = search_similar_documents_by_active_user(...)
        page_results = search_similar_pages_by_active_user(...)
        
    elif document_search_method == 'searchdocAll':
        # ค้นหาจาก Knowledge Base ทั้งหมด
        legacy_results = search_similar_documents_by_active_user_all(...)
        page_results = search_similar_pages_by_active_user_all(...)
        
    elif document_search_method == 'none':
        # ค้นหาเฉพาะใน chat ปัจจุบัน
        legacy_results = search_similar_documents_by_chat(...)
        page_results = search_similar_pages(...)
    
    # VLM Processing
    if page_results:
        vlm_summary = process_pages_with_vlm(page_results, query)
    
    return jsonify({"results": legacy_results + [vlm_summary]})
```

---

## 4. Flow การทำงานหลัก

### 4.1 Document Processing Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Document Upload & Processing Flow                     │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  User uploads PDF file                                                    │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ POST /processDocument                          │                      │
│  │ • files: [file_buffer]                         │                      │
│  │ • method: 'image' | 'text'                     │                      │
│  │ • user_id: from session                        │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Upload to MinIO                                │                      │
│  │ object_name = user_0/chat_-1/timestamp-file.pdf│                      │
│  │                                                │                      │
│  │ INSERT INTO uploaded_files (...)               │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Determine Processing Method                    │                      │
│  │                                                │                      │
│  │ if method == 'image':                          │                      │
│  │     → Image-based processing                   │                      │
│  │ else:                                          │                      │
│  │     → Text-based processing                    │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                         │                                         │
│       │ (method='image')        │ (method='text')                        │
│       ▼                         ▼                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐                        │
│  │ PDF → Images        │  │ Extract Text        │                        │
│  │ (multiprocessing)   │  │ (OCR/VLM)          │                        │
│  │                     │  │                     │                        │
│  │ for each page:      │  │ extract_pdf_text()  │                        │
│  │   convert_pdf_to_img│  │ extract_docx_text() │                        │
│  └─────────────────────┘  └─────────────────────┘                        │
│       │                         │                                         │
│       ▼                         ▼                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐                        │
│  │ Generate Image      │  │ Generate Text       │                        │
│  │ Embeddings          │  │ Embedding           │                        │
│  │ (Jina v4 2048-dim)  │  │ (Qwen3 1024-dim)   │                        │
│  └─────────────────────┘  └─────────────────────┘                        │
│       │                         │                                         │
│       ▼                         ▼                                         │
│  ┌─────────────────────┐  ┌─────────────────────┐                        │
│  │ INSERT INTO         │  │ INSERT INTO         │                        │
│  │ document_page_      │  │ document_embeddings │                        │
│  │ embeddings          │  │                     │                        │
│  │ (2048-dim vector)   │  │ (1024-dim vector)   │                        │
│  └─────────────────────┘  └─────────────────────┘                        │
│       │                         │                                         │
│       └──────────┬──────────────┘                                         │
│                  ▼                                                         │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Update file_process_status = 'finish'          │                      │
│  │                                                │                      │
│  │ Return: { status: 'success', FileID: 123 }     │                      │
│  └────────────────────────────────────────────────┘                      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Chat Message Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Chat Message Flow                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  User sends message: "อธิบายวงจร Arduino"                                 │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ POST /api/message                              │                      │
│  │ {                                              │                      │
│  │   message: "อธิบายวงจร Arduino",              │                      │
│  │   model: "{_Google_API_}gemini-2.0-flash",    │                      │
│  │   mode: "ask",                                 │                      │
│  │   docSearchMethod: "searchDoc",               │                      │
│  │   socket: "socket_id_123"                      │                      │
│  │ }                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ RAG: Search Similar Documents                  │                      │
│  │                                                │                      │
│  │ POST /search_similar                           │                      │
│  │ {                                              │                      │
│  │   query: "อธิบายวงจร Arduino",                │                      │
│  │   user_id: 1,                                  │                      │
│  │   chat_history_id: 123,                        │                      │
│  │   documentSearchMethod: "searchDoc"           │                      │
│  │ }                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Combine Context                                │                      │
│  │                                                │                      │
│  │ question = chat_history + "\n\n" +             │                      │
│  │            "document: " + search_results       │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Call LLM (Streaming)                           │                      │
│  │                                                │                      │
│  │ Google Gemini API:                             │                      │
│  │   ai.models.generateContentStream({            │                      │
│  │     model: "gemini-2.0-flash",                │                      │
│  │     contents: question                         │                      │
│  │   })                                           │                      │
│  │                                                │                      │
│  │ for await (chunk of result):                   │                      │
│  │   socket.emit('StreamText', chunk)             │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Save to Database                               │                      │
│  │                                                │                      │
│  │ UPDATE chat_history                            │                      │
│  │ SET message = message + "\nassistance: ..."   │                      │
│  │ WHERE id = 123                                 │                      │
│  └────────────────────────────────────────────────┘                      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Verified Answer Search Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Verified Answer Search Flow                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  User searches: "วิธีการต่อ LED กับ Arduino"                             │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ POST /api/search-verified-answers              │                      │
│  │ {                                              │                      │
│  │   question: "วิธีการต่อ LED กับ Arduino",     │                      │
│  │   threshold: 0.7,                              │                      │
│  │   limit: 5                                     │                      │
│  │ }                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Generate Question Embedding                    │                      │
│  │                                                │                      │
│  │ POST /encode_embedding                         │                      │
│  │ { text: "วิธีการต่อ LED...", dimensions: 1024 }│                      │
│  │                                                │                      │
│  │ → embedding: [0.12, -0.34, ...] (1024-dim)    │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Vector Search in verified_answers              │                      │
│  │                                                │                      │
│  │ SELECT id, question, answer, created_by,       │                      │
│  │        1 - (question_embedding <-> '[...]')    │                      │
│  │        AS similarity                           │                      │
│  │ FROM verified_answers                          │                      │
│  │ WHERE 1 - (question_embedding <-> '[...]')     │                      │
│  │       > 0.7                                    │                      │
│  │ ORDER BY similarity DESC                       │                      │
│  │ LIMIT 5                                        │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Return Results                                 │                      │
│  │                                                │                      │
│  │ {                                              │                      │
│  │   success: true,                               │                      │
│  │   results: [                                   │                      │
│  │     {                                          │                      │
│  │       id: 5,                                   │                      │
│  │       question: "ต่อ LED กับ Arduino...",     │                      │
│  │       answer: "ใช้ตัวต้านทาน 220Ω...",        │                      │
│  │       similarity: 0.89                         │                      │
│  │     },                                         │                      │
│  │     ...                                        │                      │
│  │   ]                                            │                      │
│  │ }                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4.4 Q&A Community System Flow

### 4.4.1 ER Diagram ระบบ Q&A

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Q&A Community System                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────┐                                                       │
│  │   verified_answers   │◄──────────────────────────────────────────┐           │
│  ├──────────────────────┤                                           │           │
│  │ id (PK)              │◄───┐                                      │           │
│  │ question             │    │                                      │           │
│  │ answer               │    │                                      │           │
│  │ tags[]               │    │                                      │           │
│  │ verification_type    │    │                                      │           │
│  │ question_embedding   │    │   ┌──────────────────────┐          │           │
│  │ answer_embedding     │    │   │ answer_verifications │          │           │
│  │ views                │    │   ├──────────────────────┤          │           │
│  │ requested_departments│    │   │ id (PK)              │          │           │
│  │ notify_me            │    ├───│ verified_answer_id   │          │           │
│  │ created_by           │    │   │ user_id              │          │           │
│  │ created_at           │    │   │ commenter_name       │          │           │
│  └──────────────────────┘    │   │ comment              │          │           │
│           │                  │   │ verification_type    │          │           │
│           │                  │   │ requested_departments│          │           │
│           │                  │   │ attachments (JSONB)  │          │           │
│           │                  │   │ due_date             │          │           │
│           │                  │   └──────────────────────┘          │           │
│           │                  │                                      │           │
│           │                  │   ┌──────────────────────┐          │           │
│           │                  │   │      comments        │          │           │
│           │                  │   ├──────────────────────┤          │           │
│           │                  │   │ id (PK)              │          │           │
│           │                  ├───│ question_id          │          │           │
│           │                  │   │ user_id              │          │           │
│           │                  │   │ username             │          │           │
│           │                  │   │ text                 │          │           │
│           │                  │   │ department           │          │           │
│           │                  │   │ attachments (JSONB)  │          │           │
│           │                  │   └──────────────────────┘          │           │
│           │                  │                                      │           │
│           │                  │   ┌──────────────────────┐          │           │
│           │                  │   │   question_votes     │          │           │
│           │                  │   ├──────────────────────┤          │           │
│           │                  │   │ id (PK)              │          │           │
│           │                  ├───│ question_id          │          │           │
│           │                  │   │ user_id              │          │           │
│           │                  │   │ vote (-1, 1)         │          │           │
│           │                  │   │ voted_at             │          │           │
│           │                  │   └──────────────────────┘          │           │
│           │                  │                                      │           │
│           │                  │   ┌──────────────────────┐          │           │
│           │                  │   │    notifications     │          │           │
│           │                  │   ├──────────────────────┤          │           │
│           │                  │   │ id (PK)              │          │           │
│           │                  └───│ question_id          │          │           │
│           │                      │ user_id──────────────┼──────────┘           │
│           │                      │ verified_by_name     │                       │
│           │                      │ verified_by_department                       │
│           │                      │ is_read              │                       │
│           │                      └──────────────────────┘                       │
│           │                                                                      │
└───────────┴──────────────────────────────────────────────────────────────────────┘
```

### 4.4.2 Verification Types และ Flow

#### 🔄 State Diagram ของ Verification

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Verification Type State Flow                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                           ┌─────────────────┐                                   │
│                           │  สร้างคำถามใหม่  │                                   │
│                           └────────┬────────┘                                   │
│                                    │                                             │
│                    ┌───────────────┼───────────────┐                            │
│                    │               │               │                            │
│                    ▼               ▼               ▼                            │
│           ┌────────────┐   ┌────────────┐   ┌────────────┐                     │
│           │   'self'   │   │ 'request'  │   │'verification│                     │
│           │ (ตอบเอง)   │   │(ขอยืนยัน)  │   │   (ยืนยัน) │                     │
│           └─────┬──────┘   └──────┬─────┘   └─────┬──────┘                     │
│                 │                 │               │                             │
│                 │                 ▼               │                             │
│                 │    ┌─────────────────────┐     │                             │
│                 │    │ รอการยืนยันจากแผนก  │     │                             │
│                 │    │ (Pending Review)    │     │                             │
│                 │    └──────────┬──────────┘     │                             │
│                 │               │                │                             │
│                 │               ▼                │                             │
│                 │    ┌─────────────────────┐     │                             │
│                 │    │  แผนกที่ถูกเลือก    │     │                             │
│                 │    │  ยืนยันคำตอบ        │     │                             │
│                 │    │  (Submit Verify)    │     │                             │
│                 │    └──────────┬──────────┘     │                             │
│                 │               │                │                             │
│                 └───────────────┼────────────────┘                             │
│                                 │                                               │
│                                 ▼                                               │
│                    ┌─────────────────────────┐                                 │
│                    │    ✅ คำตอบที่ยืนยันแล้ว   │                                 │
│                    │    (Fully Verified)     │                                 │
│                    └─────────────────────────┘                                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

| Type | ค่าใน DB | คำอธิบาย | Flow |
|------|----------|----------|------|
| **Self** | `self` | ตอบเอง | ผู้สร้างตอบคำถามเอง → ยืนยันทันที |
| **Request** | `request` | ขอยืนยัน | สร้างคำถาม → เลือกแผนก → รอยืนยัน |
| **Verification** | `verification` | การยืนยัน | เมื่อแผนกมายืนยันคำตอบ |

### 4.4.3 Create Question Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Create Question Flow                                 │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  User สร้างคำถามใหม่                                                       │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ POST /api/submit-verified-answer               │                      │
│  │ {                                              │                      │
│  │   question: "วิธีติดตั้ง Ollama?",            │                      │
│  │   answer: "ขั้นตอนการติดตั้ง...",             │                      │
│  │   tags: ["ollama", "installation"],            │                      │
│  │   verificationType: "request",                 │                      │
│  │   requestedDepartments: ["IT", "DevOps"],     │                      │
│  │   notifyMe: true                               │                      │
│  │ }                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Generate Embeddings                            │                      │
│  │                                                │                      │
│  │ • question_embedding (1024-dim)               │                      │
│  │ • answer_embedding (1024-dim)                 │                      │
│  │                                                │                      │
│  │ POST /encode_embedding                         │                      │
│  │ → Qwen3-Embedding / Jina v4                   │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Save to Database                               │                      │
│  │                                                │                      │
│  │ INSERT INTO verified_answers (                 │                      │
│  │   question, answer, question_embedding,        │                      │
│  │   answer_embedding, verification_type,         │                      │
│  │   requested_departments, notify_me,            │                      │
│  │   tags, created_by                             │                      │
│  │ )                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Create Initial Verification Record             │                      │
│  │                                                │                      │
│  │ if verificationType == 'self':                 │                      │
│  │   → INSERT answer_verifications (self)         │                      │
│  │                                                │                      │
│  │ if verificationType == 'request':              │                      │
│  │   → INSERT answer_verifications (request)      │                      │
│  │   → รอให้แผนกที่ถูก request มายืนยัน            │                      │
│  └────────────────────────────────────────────────┘                      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.4.4 Submit Verification Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Submit Verification Flow                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ผู้เชี่ยวชาญจากแผนกที่ถูกขอมายืนยัน                                         │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ POST /api/submit-verification                  │                      │
│  │ {                                              │                      │
│  │   questionId: 123,                             │                      │
│  │   comment: "คำตอบถูกต้องครับ ยืนยันแล้ว",     │                      │
│  │   department: "IT",                            │                      │
│  │   attachments: ["/api/storage/file.pdf"]       │                      │
│  │ }                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Insert Verification Record                     │                      │
│  │                                                │                      │
│  │ INSERT INTO answer_verifications (             │                      │
│  │   verified_answer_id: 123,                     │                      │
│  │   user_id: currentUser.id,                     │                      │
│  │   commenter_name: "John",                      │                      │
│  │   comment: "...",                              │                      │
│  │   verification_type: 'verification',           │                      │
│  │   requested_departments: ["IT"],               │                      │
│  │   attachments: [...]                           │                      │
│  │ )                                              │                      │
│  └────────────────────────────────────────────────┘                      │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────────────────────────────────────────────────┐                      │
│  │ Trigger Notification                           │                      │
│  │                                                │                      │
│  │ ตรวจสอบ: verified_answers.notify_me = true ?   │                      │
│  │                                                │                      │
│  │ ถ้า YES และ ผู้ยืนยัน ≠ ผู้สร้างคำถาม:          │                      │
│  │   → INSERT INTO notifications (                │                      │
│  │       question_id, user_id,                    │                      │
│  │       verified_by_name, is_read=false          │                      │
│  │     )                                          │                      │
│  │   → แจ้งเตือนผู้สร้างคำถาม 🔔                   │                      │
│  └────────────────────────────────────────────────┘                      │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.4.5 Filter Questions Types

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      Question Filter Types                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  GET /api/filter-questions?type={filter}&sortBy={sort}                    │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                                                                      │ │
│  │  Filter Types:                                                       │ │
│  │                                                                      │ │
│  │  ┌─────────────┬─────────────────────────────────────────────────┐  │ │
│  │  │    all      │ แสดงทุกคำถาม                                      │  │ │
│  │  ├─────────────┼─────────────────────────────────────────────────┤  │ │
│  │  │my-questions │ คำถามที่ user เป็นผู้สร้าง                         │  │ │
│  │  │             │ WHERE created_by = username                      │  │ │
│  │  ├─────────────┼─────────────────────────────────────────────────┤  │ │
│  │  │ my-answers  │ คำถามที่ user ไปแสดงความคิดเห็น                    │  │ │
│  │  │             │ WHERE EXISTS(comment by user)                    │  │ │
│  │  ├─────────────┼─────────────────────────────────────────────────┤  │ │
│  │  │pending-review│ อยู่ระหว่างรอยืนยัน (verified < requested)       │  │ │
│  │  │             │ WHERE verification_type='request'                │  │ │
│  │  │             │   AND 0 < verified_count < total_requested       │  │ │
│  │  ├─────────────┼─────────────────────────────────────────────────┤  │ │
│  │  │ unverified  │ ยังไม่มีการยืนยันเลย                               │  │ │
│  │  │             │ WHERE verification_type='request'                │  │ │
│  │  │             │   AND verified_count = 0                         │  │ │
│  │  ├─────────────┼─────────────────────────────────────────────────┤  │ │
│  │  │  verified   │ ยืนยันครบแล้ว (self หรือ request ที่ครบ)          │  │ │
│  │  │             │ WHERE verification_type='self'                   │  │ │
│  │  │             │   OR verified_count >= total_requested           │  │ │
│  │  └─────────────┴─────────────────────────────────────────────────┘  │ │
│  │                                                                      │ │
│  │  Sort Options:                                                       │ │
│  │  • newest - เรียงตามวันที่สร้าง (ใหม่สุดก่อน)                         │ │
│  │  • score  - เรียงตามคะแนน vote                                       │ │
│  │  • views  - เรียงตามจำนวนการเข้าชม                                   │ │
│  │  • verified - เรียงตามจำนวนการยืนยัน                                 │ │
│  │                                                                      │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.4.6 ตารางเพิ่มเติมสำหรับ Q&A

#### `comments` - ความคิดเห็น

```sql
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    user_id INT,
    username VARCHAR(255),
    text TEXT NOT NULL,
    department VARCHAR(255),
    attachments JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### `question_votes` - การโหวต (Stack Overflow Style)

```sql
CREATE TABLE IF NOT EXISTS question_votes (
    id SERIAL PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),  -- -1=downvote, 1=upvote
    voted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(question_id, user_id)
);
```

#### `notifications` - การแจ้งเตือน

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES verified_answers(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    verified_by_name VARCHAR(255),
    verified_by_department VARCHAR(255),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(question_id, user_id)
);
```

### 4.4.7 Q&A API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/submit-verified-answer` | POST | สร้างคำถามใหม่ |
| `/api/submit-verification` | POST | ยืนยันคำตอบ |
| `/api/filter-questions` | GET | กรองคำถามตามประเภท |
| `/api/get-all-verified-answers` | GET | ดึงคำถามทั้งหมด |
| `/api/search-verified-answers` | POST | ค้นหาคำถามด้วย Vector Search |
| `/api/get-comments/:questionId` | GET | ดึง comments ของคำถาม |
| `/api/add-comment` | POST | เพิ่ม comment |
| `/api/vote-question/:questionId` | POST | โหวตคำถาม (±1) |
| `/api/get-verifications/:questionId` | GET | ดึงรายการยืนยันทั้งหมด |
| `/api/get-verification-status/:questionId` | GET | ดึงสถานะการยืนยันตามแผนก |
| `/api/increment-view` | POST | เพิ่มจำนวนการเข้าชม |
| `/api/get-notifications` | GET | ดึงการแจ้งเตือนของ user |
| `/api/mark-notification-read` | POST | อ่านการแจ้งเตือนแล้ว |
| `/api/hot-tags` | GET | ดึง tags ยอดนิยม |
| `/api/upload-comment-files` | POST | อัปโหลดไฟล์แนบใน comment |

---

## 5. API Endpoints

### 5.1 Document Processing APIs (Python Flask)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/processDocument` | POST | อัปโหลดและประมวลผลเอกสารเข้า Knowledge Base |
| `/process` | POST | อัปโหลดและประมวลผลเอกสารสำหรับ chat |
| `/search_similar` | POST | ค้นหาเอกสารที่คล้ายกัน (Unified) |
| `/search_similar_pages` | POST | ค้นหาหน้าเอกสาร (Image-based) |
| `/encode_embedding` | POST | สร้าง embedding จากข้อความ |
| `/test_db` | GET | ทดสอบการเชื่อมต่อฐานข้อมูล |

### 5.2 Agent APIs (TypeScript Express)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/message` | POST | ส่งข้อความและรับคำตอบจาก LLM |
| `/api/upload` | POST | อัปโหลดไฟล์ไปยัง chat |
| `/api/processDocument` | POST | Proxy ไปยัง Python processDocument |
| `/api/search-verified-answers` | POST | ค้นหาคำตอบที่ยืนยันแล้ว |
| `/api/storage/*` | GET | ดึงไฟล์จาก MinIO |
| `/api/create_record` | POST | สร้าง session และ chat ใหม่ |

### 5.3 Request/Response Examples

#### POST /search_similar

```json
// Request
{
  "query": "วิธีต่อ LED กับ Arduino",
  "user_id": 1,
  "chat_history_id": 123,
  "top_k_text": 5,
  "top_k_pages": 5,
  "threshold_page": 0.8,
  "threshold_text": 0.3,
  "documentSearchMethod": "searchDoc"
}

// Response
{
  "results": [
    {
      "id": 45,
      "file_name": "arduino_tutorial.pdf",
      "object_name": "user_1/chat_123/1703836800-arduino_tutorial.pdf",
      "page_number": 5,
      "text": "การต่อ LED กับ Arduino ใช้ตัวต้านทาน...",
      "distance": 0.25
    },
    "Based on the document pages, to connect an LED to Arduino: Use a 220Ω resistor..."
  ]
}
```

#### POST /processDocument

```json
// Request (multipart/form-data)
// files: [file1.pdf, file2.pdf]
// method: "image"
// user_id: "1"

// Response
{
  "status": "success",
  "message": "Successfully processed 2 items.",
  "details": [
    {"name": "file1.pdf", "status": "indexed_as_images", "pages": 15},
    {"name": "file2.pdf", "status": "indexed_as_images", "pages": 8}
  ],
  "FileID": 123
}
```

---

## 6. การตั้งค่าและ Environment Variables

### 6.1 Database Configuration

```env
# PostgreSQL
PGDATABASE=ai_agent
PGUSER=athip
PGPASSWORD=123456
PGHOST=localhost
PGPORT=5432

# Connection URL
DATABASE_URL=postgresql://athip:123456@localhost:5432/ai_agent
```

### 6.2 MinIO Configuration

```env
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9010
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
MINIO_BUCKET=user-files
```

### 6.3 AI Services Configuration

```env
# Local/Remote Toggle
LOCAL=True  # True = Ollama, False = API

# Ollama
API_OLLAMA=http://127.0.0.1:11434/api/generate

# DeepInfra
DEEPINFRA_API_KEY=your_deepinfra_key

# OpenRouter
OPENROUTER_API_KEY=your_openrouter_key

# Jina AI
JINA_API_KEY=your_jina_key

# Google AI
Google_API_KEY=your_google_key

# OpenAI (Optional)
OPENAI_API_KEY=your_openai_key
```

### 6.4 Server Configuration

```env
# API Server URL
API_SERVER_URL=http://localhost:5000
API_APP=http://localhost:5000
```

---

## 📌 Summary

ระบบนี้เป็น **RAG-based LLM Chatbot** ที่รวม:

1. **Multimodal RAG** - รองรับทั้ง Text และ Image embeddings
2. **Hybrid Search** - ค้นหาทั้ง Text chunks และ Document pages
3. **HyDE (Hypothetical Document Embeddings)** - ใช้ LLM สร้างเอกสารสมมติเพื่อปรับปรุงการค้นหา
4. **VLM Integration** - ใช้ Vision Language Model วิเคราะห์ภาพเอกสาร
5. **Q&A Community** - ระบบ Verified Answers สำหรับความรู้องค์กร
6. **Flexible Deployment** - รองรับทั้ง Local (Ollama) และ Cloud (DeepInfra, OpenRouter, Google)

**Key Technologies:**
- pgvector สำหรับ Vector Search
- Jina v4 สำหรับ Multimodal Embeddings
- Qwen3-Embedding สำหรับ Text Embeddings
- Qwen2.5-VL สำหรับ VLM
- MinIO สำหรับ Object Storage


# Human Knowledge Base -> ใช้สร้างคำตอบ AI ให้คน
Verified Knowledge (priority สูงสุด)
User Attached Files (priority ต่ำกว่า)
# ai_draft_answers
verified_answers_draft


# AI Learning Data -> วิเคราะห์ข้อผิดพลาด AI เพื่อปรับปรุงโมเดล
## AI Analysis Pattern
    Compare AI vs Human
    Detect conflict patterns
    Improve prompt/routing


    วิเคราะห์ว่า AI ขาดความรู้ในหัวข้อไหน
    Electrical Pad    ████████████████████░░░░  85% ✅ (3 errors)   
    Wire Bonding      ██████████████░░░░░░░░░░  60% ⚠️ (8 errors)   
    Die Attach        ████████░░░░░░░░░░░░░░░░  35% ❌ (15 errors)  
    Package Design    ██████░░░░░░░░░░░░░░░░░░  25% ❌ (20 errors)








┌─────────────────────────────────────────────────────────────────────┐
│                    คำถามเข้ามา 2 แบบ                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐        ┌─────────────────────┐            │
│  │ 1. Chat → Verify    │        │ 2. Create Question  │            │
│  │ (มี AI ตอบแล้ว)      │        │ (ยังไม่มีคำตอบ)       │            │
│  └──────────┬──────────┘        └──────────┬──────────┘            │
│             │                              │                        │
│             ▼                              ▼                        │
│  ┌──────────────────────────────────────────────────────┐          │
│  │              🤖 AI Suggests (ใหม่)                    │          │
│  │  - ค้นหาจาก verified_answers (Knowledge Base)        │          │
│  │  - สร้างคำตอบแนะนำ                                    │          │
│  │  - บันทึกลง ai_suggestions table                     │          │
│  └──────────────────────┬───────────────────────────────┘          │
│                         │                                           │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────────────┐          │
│  │              👤 Human Review                          │          │
│  │  - ดู AI Suggests                                    │          │
│  │  - แก้ไข / ยืนยัน / ปฏิเสธ                            │          │
│  └──────────┬───────────────────────────┬───────────────┘          │
│             │                           │                           │
│             ▼                           ▼                           │
│  ┌─────────────────────┐     ┌─────────────────────────┐           │
│  │ Human Knowledge Base│     │   AI Learning Data      │           │
│  │ (ตอบคนจริง)          │     │   (วิเคราะห์ AI)         │           │
│  ├─────────────────────┤     ├─────────────────────────┤           │
│  │ • verified_answers  │     │ • ai_suggestions        │           │
│  │ • answer_verifications    │ • ai_learning_analysis  │           │
│  │                     │     │                         │           │
│  │ ใช้: ตอบคำถามผู้ใช้   │     │ ใช้: ปรับ prompt,       │           │
│  │      RAG search     │     │      routing rules,     │           │
│  │                     │     │      dashboard insight  │           │
│  └─────────────────────┘     └─────────────────────────┘           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘


Suggest group : AI auto-assign Knowledge Group
ถ้า AI ไม่มั่นใจ? : Unclassified




TRUNCATE TABLE
  public.ai_learning_analysis,
  public.ai_suggestions,
  public.answer_verifications,
  public.chat_history,
  public.comments,
  public.document_embeddings,
  public.document_page_embeddings,
  public.notifications,
  public.question_attachments,
  public.question_votes,
  public.uploaded_files,
  public.verified_answers
RESTART IDENTITY;
