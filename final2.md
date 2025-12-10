## 🏗️ การทำงานหลักๆ
ai_agent_core -> หน้าเว็บ 
api_server -> ทำหน้าที่ดึงข้อมูลออกจากเอกสาร 
<!-- การทำงานเวลาอัพเอกสาร -->
upload -> ai_agent_core -> api_server (model.py)


util.py -> function การทำงานทั้งหมด 
model.py -> ดึง function ใน util.py มาใช้

**Flow**: 
```
⭐
หน้าเว็บ (ai_agent_core) ->  PDF File → api_server/model.py (/process endpoint)

    (util.py)           → extract_pdf_text() (util.py)
                        → ดึง text ออกมา
                        → encode_text_for_embedding() 
                        → สร้าง Vector Embedding
                        → บันทึก PostgreSQL
⭐
```
ความหมายของ 
-  public -> ไฟล์ Frontend (ส่วนที่ผู้ใช้เห็น)
-  src    -> ไฟล์ Backend (เซิร์ฟเวอร์ - ผู้ใช้ไม่เห็น)

-------------------------------------------
จะมีหน้า community ดูคำตอบที่เกี่ยวข้อง -> อ้างอิงยื่นยันโดย ...
ปุ่มกดดูคำตอบที่เกี่ยวข้องกับคำถามใน -> community
ไอเดีย: "Verified Answers" -> เก็บคำตอบที่ verified โดยชุมชน

สิ่งที่ต้องเก็บ (Vector Search Only)
Step 1: เก็บ TEXT + VECTOR EMBEDDING
- question_text (คำถาม) 
- answer_text (คำตอบ)  
- question_embedding VECTOR(1024) ← สำหรับ semantic search

Step 2: User ให้คะแนน (Like/Dislike)  
- rating = 1-5 (star rating) หรือ /dislike
- comment = "ใช้ได้ผล!" (optional)   
- commenter_name = "user123"  

Step 3: คำนวณ & Update Aggregate    
- avg_rating = AVG(rating) ทุกครั้ง
- verified_count = COUNT(DISTINCT user) where rating > 0
- rating_count = COUNT(*)
- last_updated_at = update timestamp   

Step 4: ค้นหาคำตอบ     
- Vector similarity search: 1 - (v1 <-> v2) > 0.7
- SQL: SELECT * ORDER BY similarity DESC, avg_rating DESC
- ใช้ pgvector similarity matching ✅ 

------------------------------------------------------------
Phase 1: DATABASE (ต้องสร้างก่อน)
1.✅ Create SQL Tables 
- สร้าง verified_answers + answer_verifications tables + pgvector extension
  ไฟล์: PostgreSQL (run SQL script)
  เวลา: 5 นาที
Phase 2: BACKEND API (ให้ AI สามารถเก็บ-ค้นหา)
1.✅ POST /verify-answer 
- รับ question + answer + rating จากหน้า Chat → บันทึกลง DB
  ไฟล์: ai_agent_core/src/api.ts
  เวลา: 15 นาที
2.✅ GET /verified-answers 
- ค้นหาด้วย Vector Similarity
  ไฟล์: ai_agent_core/src/api.ts
  เวลา: 10 นาที
3.✅ GET /verified-answers/:id 
- ดึงรายละเอียด + comments
  ไฟล์: ai_agent_core/src/api.ts
  เวลา: 5 นาที
Phase 3: CHAT LOGIC (เช็คคำตอบก่อน)
1.✅ Backend - Search Before Generate 
- แก้ agent.ts ให้ค้นหา verified_answers ก่อนส่ง AI
  ไฟล์: ai_agent_core/src/agent.ts
  เวลา: 10 นาที
Phase 4: CHAT UI (แสดงผล)
1.✅ Add Like Button + Show Verified Answer 
- แก้ script.js เพื่อ:
  แสดง verified answer พร้อมโหวต
  แสดง AI answer ถ้าไม่มี verified
  ปุ่ม 👍 Like / 🌐 View Community
  ไฟล์: ai_agent_core/public/script.js
  เวลา: 20 นาที
Phase 5: COMMUNITY PAGE (ดูทั้งหมด)
✅ Create community.html 
- หน้าแยก browse/filter/comment
  ไฟล์: ai_agent_core/public/community.html + CSS + JS
  เวลา: 30 นาที


<!-- Hot Questions จะแสดง -->
Score = (views * 0.3) + (verified ? 100 : 0) + (rating_count * 10)






<!-- เหลือให้ข้อมูลที่ ver ลง posgresql -->











### **🎯 สรุปง่ายๆ**

| Module | ทำหน้าที่ | ใช้กับ |
|--------|---------|--------|
| **ai_agent_core** | Frontend + Backend Orchestration | ทุกครั้ง |
| **api_server** | ⭐ **ดึง TEXT** จากไฟล์ | เมื่ออัปโหลดเอกสาร |
| **api_local_server** | ควบคุมเครื่อง (ไม่ดึง text) | เมื่อ AI ต้องรันคำสั่ง |
| **TextToImage** | สร้างรูป | เมื่อ AI ต้องสร้างรูป |

---

## 🖥️ ส่วนที่ 1: FRONTEND (หน้าเว็บ)

### 📁 `ai_agent_core/public/` - ไฟล์ส่วนติดต่อ

| ไฟล์ | หน้าที่ |
|------|--------|
| **index.html** | 🏠 หน้าหลัก Chat Interface - ตัวหลักที่ผู้ใช้มองเห็น |
| **login.html** | 🔐 หน้า Login - สำหรับเข้าสู่ระบบ |
| **register.html** | 📝 หน้าสมัครสมาชิก - สำหรับลงทะเบียนผู้ใช้ใหม่ |

| **script.js** | ⚙️ Logic หลัก - จัดการ chat, ส่งข้อความ, เลือก model, ปรับแต่ง UI |
| **login.js** | 🔐 Logic Login - จัดการการเข้าสู่ระบบ, ตรวจสอบ credentials |
| **register.js** | 📝 Logic Register - จัดการการลงทะเบียน, validate ข้อมูล |
| **file_browser.js** | 📂 File Browser - จัดการ upload/display ไฟล์ |
| **style.css** | 🎨 Styling หลัก - CSS สำหรับหน้า chat |
| **styleRL.css** | 🎨 Styling Login/Register - CSS สำหรับหน้า authentication |

---

## 🖥️ ส่วนที่ 2: BACKEND หลัก (Node.js)

📁 `ai_agent_core/src/` - ไฟล์ TypeScript

**`index.ts` - ประตูทางเข้า (Entry Point)**

**หน้าที่**: เริ่มต้น Express Server และ WebSocket

**ฟีเจอร์หลัก**:
- ตั้งค่า Express middleware (CORS, JSON parsing, URL-encoded)
- สร้าง HTTP Server + WebSocket (Socket.IO) บนพอร์ต 3000
- ตั้งค่า Session Management (ความจำผู้ใช้)
  - Timeout 1 วัน (24 ชั่วโมง)
  - Auto-cleanup ทุก 3 นาที
- จัดการ Session Timeout - ลบผู้ใช้ guest หลังจาก 1 ชั่วโมงที่ไม่ใช้งาน
- Track ผู้ใช้ที่ online/offline ผ่าน Socket.IO
  - ส่ง ping ทุก 40 วินาที
  - ลบ client ที่หายไป 2.5 นาที
- เสิร์ฟไฟล์ static (HTML/CSS/JS จาก public/)

**Key Logic**:
```typescript
// Session timeout 1 hour
const TIMEOUT_DURATION = 1 * 60 * 60 * 1000;

// Ping clients every 40 seconds
setInterval(async () => {
  for (const [socketId, client] of clients.entries()) {
    if (now - client.lastSeen > CLIENT_TIMEOUT_MS) {
      // ลบ client ที่ timeout
    } else {
      socket.emit('ping');
    }
  }
}, 40 * 1000);
```

---

#### **`agent.ts` - ประสาท AI (AI Agent Logic)**

**หน้าที่**: จัดการการสนทนาและเรียกใช้เครื่องมือ

**Endpoints**:
- `POST /api/message` - รับข้อความจากผู้ใช้ → ส่งไป AI → ประมวลผล → ส่งคำตอบกลับ
- `POST /api/upload` - อัปโหลดไฟล์

**ฟีเจอร์หลัก**:
- เลือกใช้ AI Model:
  - 🤖 Google GenAI (Gemini)
  - 🤖 OpenAI (GPT)
  - 🤖 Ollama (Local LLM)
  - 🤖 OpenRouter / DeepInfra
- ส่งข้อความไป AI พร้อม System Prompt (ที่เก็บใน `build/setting.txt`)
- แปลง XML response จาก AI เป็น JSON เพื่อดึงชื่อ tool ที่ต้องเรียก
- เรียกใช้ tool ตามที่ AI ต้องการ (ใช้ `api.ts`)
- เก็บประวัติการสนทนา ลงฐานข้อมูล
- Upload ไฟล์ไป MinIO Object Storage

**System Prompt** (จาก `build/setting.txt`):
- บอก AI ว่าสามารถใช้ tools อะไรได้
- ให้ AI ตอบในรูป XML ของ tool calls
- ตั้ง Role และ Persona ของ AI

---

#### **`api.ts` - ชุดเครื่องมือ (Tool Functions)**

**หน้าที่**: ฟังก์ชันต่างๆที่ AI สามารถเรียกใช้ได้

**เครื่องมือที่มี**:

| Tool | ฟังก์ชัน |
|------|---------|
| **IMG_Generate** | 🎨 สร้างรูปภาพจาก text prompt (เรียก `/Generate` จาก Python API) |
| **getPage** | 🌐 ดึงข้อมูลจากเว็บไซต์ (เรียก `/GetPage` พร้อม Selenium) |
| **clickElement** | 🖱️ คลิกปุ่มบนเว็บ (ใช้ Selenium) |
| **GetData** | 📊 ดึงข้อมูลจาก Vector Database (สำหรับ RAG) |
| **SearchByDuckDuckGo** | 🔍 ค้นหาบนเว็บ |
| **ProcessDocument** | 📄 ประมวลผลไฟล์ (PDF, Image, DOCX ฯลฯ) |
| **ListFiles** | 📁 แสดงรายการไฟล์ |
| **ReadFile** | 📖 อ่านข้อมูลจากไฟล์ |
| **CreateFile** | ✏️ สร้างไฟล์ใหม่ |
| **EditFile** | 🖊️ แก้ไขไฟล์ |
| **DeleteFile** | 🗑️ ลบไฟล์ |
| **ExecuteCommand** | 💻 รันคำสั่ง shell (เรียก local API server) |
| **TakeScreenshot** | 📸 ถ่ายหน้าจอ (เรียก local API server) |

**ตัวอย่าง Tool Call**:
```typescript
// AI ตอบกลับในรูป XML:
<IMG_Generate>
  <prompt>a beautiful sunset over mountains</prompt>
  <img_url>https://example.com/image.jpg</img_url>
</IMG_Generate>

// api.ts แปลง XML → JSON → เรียก /Generate endpoint
// ส่งคำตอบกลับไป AI พร้อมผลลัพธ์
```

---

#### **`auth.ts` - ระบบล็อคอิน**

**Endpoints**:
- `POST /auth/register` - สมัครสมาชิกใหม่
- `POST /auth/login` - เข้าสู่ระบบ

**ฟีเจอร์**:
- **Register**:
  - ตรวจสอบ username ซ้ำ
  - ตรวจสอบ email ซ้ำ
  - Hash password ด้วย bcrypt (10 rounds)
  - สร้าง user record ในฐานข้อมูล

- **Login**:
  - ตรวจสอบ username/password
  - สร้าง Session
  - ดึงประวัติ chat ของผู้ใช้
  - ตั้งค่า current chat mode/model

---

#### **`db.ts` - ฐานข้อมูล**

**หน้าที่**: เชื่อมต่อ PostgreSQL และ MinIO

**ฟังก์ชัน**:
- **User Management**:
  - `createUser()` - สร้าง user ปกติ
  - `createGuestUser()` - สร้าง user guest (ไม่ต้อง login)
  - `getUserByUsername()` / `getUserByEmail()`
  - `deleteUserAndHistory()` - ลบ user และประวัติทั้งหมด

- **Chat History**:
  - `newChatHistory()` - สร้าง chat session ใหม่
  - `storeChatHistory()` - บันทึกข้อความ
  - `readChatHistory()` - ดึงประวัติ
  - `listChatHistory()` - แสดงรายการ chat

- **File Management**:
  - `uploadFile()` - อัปโหลดไฟล์ไป MinIO
  - `getFileByObjectName()` - ดึงไฟล์จาก MinIO
  - `getFileInfoByObjectName()` - ดึง metadata ไฟล์

- **Embeddings** (สำหรับ RAG):
  - `saveEmbedding()` - บันทึก vector embedding
  - `searchSimilarDocuments()` - ค้นหาเอกสารคล้ายกัน

---

### 📁 `ai_agent_core/build/` - ไฟล์ที่ Compile

| ไฟล์ | หน้าที่ |
|------|--------|
| **agent.js** | JavaScript ที่ compile จาก agent.ts |
| **api.js** | JavaScript ที่ compile จาก api.ts |
| **auth.js** | JavaScript ที่ compile จาก auth.ts |
| **db.js** | JavaScript ที่ compile จาก db.ts |
| **index.js** | JavaScript ที่ compile จาก index.ts |
| **setting.txt** | 📋 System Prompt หลัก (ระบบ Code Mode) |
| **setting_prompt.txt** | 📋 Prompt สำหรับโหมดต่างๆ |

---

## 🐍 ส่วนที่ 3: PYTHON API SERVER

### 📁 `api_server/` - Python Flask Server

#### **`model.py` - เซิร์ฟเวอร์หลัก**

**พอร์ต**: 5000

**🔄 วิธีการทำงาน: Dual-Model System**

✅ **ใช่ครับ** api_server มี **2 models ที่ทำงานร่วมกัน**:

```
File Input
    ↓
┌───────────────────────────────────────────────┐
│ Model 1: Document Extractor                   │
│ (อ่านไฟล์ + แยกข้อความ)                      │
│                                               │
│ ├─ extract_pdf_text() → ดึง text              │
│ ├─ extract_docx_text() → ดึง text             │
│ ├─ extract_image_text() → OCR                 │
│ └─ extract_pptx_text() → ดึง text             │
│                                               │
│ ⬇️ Output: Extracted Text                     │
└───────────────────────────────────────────────┘
    ↓
┌───────────────────────────────────────────────┐
│ Model 2: Embedding Generator                  │
│ (สร้างคำตอบใหม่ = Vector Embedding)          │
│                                               │
│ ├─ HuggingFace Embedding Model → 1024 dims   │
│ ├─ Split text into chunks                    │
│ ├─ สร้าง Vector Embedding                    │
│ └─ บันทึก Vector ลง PostgreSQL               │
│                                               │
│ ⬇️ Output: Vector Embeddings                 │
└───────────────────────────────────────────────┘
    ↓
PostgreSQL (pgvector extension)
```

**ตัวอย่างการไหล**:

1️⃣ **ผู้ใช้อัปโหลด PDF** → `/process` endpoint รับไฟล์
   ```
   POST /process
   files: [document.pdf]
   ```

2️⃣ **Model 1 ทำงาน**: ดึง text จาก PDF
   ```python
   extracted_text = extract_pdf_text(pdf_path)
   # Output: "นี่คือข้อความจาก PDF..."
   ```

3️⃣ **Model 2 ทำงาน**: สร้าง Embedding จากข้อความที่ดึงมา
   ```python
   embedding = encode_text_for_embedding(extracted_text)
   # Output: [0.123, 0.456, 0.789, ...] (1024 dimensions)
   ```

4️⃣ **บันทึก Vector ลง Database**:
   ```python
   save_vector_to_db(
       user_id=user_id,
       extracted_text=extracted_text,
       embedding=embedding,
       page_number=page_num
   )
   ```

5️⃣ **เมื่อ AI ต้องการตอบคำถาม**: ใช้ Vector Search
   ```python
   similar_docs = search_similar_documents_by_chat(
       user_id=user_id,
       query_text="เนื้อหากล่าว"
   )
   # ใช้เอกสารคล้ายกันเป็น Context ให้ AI
   ```

**🎯 สรุป**: 
- **Model 1** = "อ่านเครื่อง" (Document Extraction)
- **Model 2** = "เข้าใจเครื่อง" (Embedding Generation)
- **ร่วมกัน** = RAG System (Retrieval Augmented Generation)

---

**Endpoints**:

| Endpoint | Method | ฟังก์ชัน |
|----------|--------|---------|
| `/process` | POST | อัปโหลดไฟล์ → แยกข้อความ → สร้าง Embedding → บันทึก DB |
| `/search_similar` | POST | ค้นหาเอกสารคล้ายกัน (Vector Search ด้วย pgvector) |
| `/Generate` | POST | สร้างรูปภาพจาก text prompt (DDPM Diffusion Model) |
| `/GetPage` | POST | ดึงข้อมูลจากเว็บไซต์ (ใช้ Selenium + Chrome) |
| `/GetData` | POST | ดึงข้อมูลจาก Vector Database |
| `/Search_By_DuckDuckGo` | POST | ค้นหาข้อมูลบนเว็บ (ใช้ DuckDuckGo API) |
| `/test_db` | GET | ทดสอบการเชื่อมต่อฐานข้อมูล |
| `/test_embedding_save` | POST | ทดสอบการบันทึก embedding |

**ฟีเจอร์หลัก**:
- เชื่อมต่อ PostgreSQL
- เชื่อมต่อ MinIO (Object Storage)
- ประมวลผล 10+ ชนิดไฟล์ (PDF, DOCX, PPTX, Excel, รูปภาพ ฯลฯ)
- สร้าง Embedding ด้วย HuggingFace Models
- ค้นหาด้วย Vector Similarity (pgvector)
- Dual-method RAG:
  - Text-based: แยกข้อความ → Embedding
  - Image-based: แปลงหน้า PDF เป็นรูป → CLIP Embedding → VLM (Vision-Language Model)

---

#### **`model2.py` / `model3.py`**
- เวอร์ชันทดลองอื่นๆ ของ API Server

#### **`test.py`**
- ไฟล์ทดสอบ

#### **`requirements.txt`**
- รายการ Python packages ที่ต้องติดตั้ง:
  - **LangChain**: langchain-core, langchain-community, langchain-openai, langchain-ollama
  - **Models**: ollama, openai, transformers
  - **Embeddings**: sentence-transformers, langchain-huggingface
  - **Database**: psycopg2, chromadb, minio
  - **Web Scraping**: flask, selenium, beautifulsoup4, duckduckgo-search
  - **Document Processing**: pymupdf, docling, unstructured
  - **Image Processing**: pillow, opencv, torchvision
  - **Deep Learning**: torch, transformers

### 📁 `api_server/utils/` - ฟังก์ชันช่วย

#### **`util.py`**

ฟังก์ชันสำหรับ:
- `extract_pdf_text()` - แยกข้อความจาก PDF
- `extract_docx_text()` - แยกข้อความจาก Word
- `extract_pptx_text()` - แยกข้อความจาก PowerPoint
- `extract_excel_text()` - แยกข้อความจาก Excel
- `extract_image_text()` - อ่าน OCR จากรูป
- `save_vector_to_db()` - บันทึก embedding ลงฐานข้อมูล
- `search_similar_documents_by_chat()` - ค้นหาเอกสารคล้ายใน Vector DB
- `upload_file_to_minio_and_db()` - อัปโหลดไฟล์ไป MinIO + บันทึก metadata
- `get_clip_embedding()` - สร้าง embedding จาก CLIP (สำหรับรูป)
- `convert_pdf_page_to_image()` - แปลงหน้า PDF เป็นรูป
- `search_similar_pages()` - ค้นหาหน้า PDF คล้ายกัน
- `process_pages_with_vlm()` - ประมวลผลหน้าเอกสารด้วย Vision-Language Model

---

## 🖥️ ส่วนที่ 4: LOCAL API SERVER

### 📁 `api_local_server/src/index.ts`

**พอร์ต**: 3333 (บนเครื่องของผู้ใช้)

**หน้าที่**: ให้ AI ควบคุมเครื่องของผู้ใช้ได้

**Endpoints**:

| Endpoint | Method | ฟังก์ชัน |
|----------|--------|---------|
| `/system/info` | GET | 📊 ดึงข้อมูลระบบ (OS, CPU, RAM, GPU, เวลา) |
| `/files/list` | GET | 📁 แสดงรายการไฟล์ในโฟลเดอร์ |
| `/files/read` | POST | 📖 อ่านไฟล์ของผู้ใช้ (สามารถกำหนด start_line, end_line) |
| `/files/create` | POST | ✏️ สร้างไฟล์ใหม่บนเครื่องผู้ใช้ |
| `/files/edit` | POST | 🖊️ แก้ไขไฟล์ (เปลี่ยน line บางแถว หรือแทนที่ทั้งไฟล์) |
| `/files/delete` | POST | 🗑️ ลบไฟล์ |
| `/files/download` | POST | ⬇️ ดาวน์โหลดไฟล์ |
| `/files/change_dir` | POST | 📂 เปลี่ยน working directory |
| `/files/create_folder` | POST | 📁 สร้าง folder ใหม่ |
| `/command/execute` | POST | 💻 รันคำสั่ง shell/PowerShell |
| `/screenshot` | GET | 📸 ถ่ายหน้าจอ |

**ฟีเจอร์**:
- ดึงข้อมูลระบบแบบละเอียด (CPU, RAM, GPU, OS info)
- **อ่านไฟล์ของผู้ใช้** ✅ (ไฟล์ใดก็ได้ในเครื่องผู้ใช้)
- **สร้างไฟล์ใหม่** ✅ (บันทึก file ที่ AI สร้าง)
- **แก้ไขไฟล์** ✅ (เปลี่ยนแปลง line เฉพาะส่วน หรือเขียนทับ)
- **ลบไฟล์** ✅
- จัดการ folder
- รันคำสั่ง terminal
- ถ่ายภาพหน้าจอ

**ไฟล์ที่อ่านได้**:
- ✅ **ไฟล์ใดก็ได้บนเครื่องผู้ใช้** (ขึ้นอยู่กับ BASE_DIR ที่ตั้ง)
- 📝 ไฟล์ text: .txt, .py, .js, .json, .html, .css ฯลฯ
- 📄 ไฟล์เอกสาร (ถ้าเป็น text-based)
- 🖼️ ไฟล์เบ่งบานไฟล์ (แสดงชื่อเท่านั้น)

**ตัวอย่างการใช้**:
```json
// AI ต้องการอ่านไฟล์ config.json
POST /files/read
{
  "file_name": "config.json"
}
// Response: เนื้อหา config.json พร้อม line number

// AI ต้องการสร้างไฟล์ใหม่
POST /files/create
{
  "file_name": "output.txt",
  "text": "Hello, this is created by AI"
}

// AI ต้องการแก้ไข line 5-10 ของไฟล์
POST /files/edit
{
  "file_name": "script.py",
  "start_line": 5,
  "end_line": 10,
  "text": "new code here"
}
```

---

## 🎨 ส่วนที่ 5: เพิ่มเติม

### 📁 `TextToImage/` - สร้างรูปภาพ

#### **`ddpm_model.py`**
- DDPM Diffusion Model สำหรับสร้างรูปภาพ

#### **`testCLIP.ipynb`**
- Jupyter Notebook สำหรับทดสอบ CLIP model
- CLIP = Connection Image-Language Pairs (เข้าใจทั้งรูปและข้อความ)

#### **`model/checkpoint/`**
- ไฟล์ pre-trained model

#### **`utils/`**
- `utils.py` - ฟังก์ชันช่วย
- `node.py` - โครงสร้างข้อมูล
- `resize_images.py` - ปรับขนาดรูปภาพ

---

### 📁 `object_detection_byVLM_Grounding_DINO/`

#### **`grounding_dino_api.py`**
- Object Detection API
- ใช้ Grounding DINO model
- ตรวจจับวัตถุในรูปภาพและบอกตำแหน่ง

---

## 🗄️ ส่วนที่ 6: ฐานข้อมูล

### **PostgreSQL Database (`ai_agent`)**

#### **ตาราข้อมูล**

| ตาราข้อมูล | เก็บข้อมูลอะไร |
|----------|-------------|
| **users** | ผู้ใช้: id, username, password (hashed), email, created_at, is_active, current_chat_id, role, is_guest |
| **chat_history** | ประวัติการสนทนา: id, user_id, message, chat_mode, chat_model, timestamp |
| **uploaded_files** | ข้อมูลไฟล์ที่อัปโหลด: id, user_id, chat_history_id, file_name, object_name (MinIO key), mime_type, file_size_bytes |
| **document_embeddings** | Vector Embeddings ของเอกสาร (สำหรับ RAG): id, user_id, chat_history_id, uploaded_file_id, extracted_text, embedding (VECTOR 1024), page_number |
| **document_page_embeddings** | Vector ของแต่ละหน้าเอกสาร (สำหรับ multi-page RAG) |

#### **Vector Storage**
- ใช้ **pgvector** extension
- Embedding dimension = 1024
- ค้นหาด้วย `<->` operator (cosine distance)

---

## 🐳 ส่วนที่ 7: DOCKER

### **`docker-compose.yml` - เซิร์ฟเวอร์หลัก**

**Services**:

| Service | Image | Port | ฟังก์ชัน |
|---------|-------|------|---------|
| **app** | Dockerfile (ai_agent_core) | 3000 | Frontend + Node.js Backend |
| **db** | postgres:15 | 5432 | PostgreSQL Database |
| **minio** | minio/minio | 9010/9090 | Object Storage (เก็บไฟล์) |

**Environment Variables**:
```
DATABASE_URL=postgresql://athip:123456@db:5432/ai_agent
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

**ใช้คำสั่ง**:
```bash
docker-compose up -d --build
# Frontend: http://localhost:3000
# MinIO Console: http://localhost:9090
```

---

### **`docker-compose_api_server.yml` - Python API Server**

**Services**:

| Service | Image | Port | ฟังก์ชัน |
|---------|-------|------|---------|
| **api_server** | Dockerfile (api_server) | 5000 | Python Flask API Server |
| **ollama** | ollama/ollama | 11434 | Local LLM (Ollama) |

**Environment Variables**:
```
DATABASE_URL=postgresql://athip:123456@db:5432/ai_agent
MINIO_ENDPOINT=minio:9000
```

**ใช้คำสั่ง**:
```bash
docker-compose -f docker-compose_api_server.yml up -d --build
# API Server: http://localhost:5000
# Ollama API: http://localhost:11434
```

---

## 📊 ลำดับการทำงาน (Data Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. ผู้ใช้เปิด Browser → หน้า Chat (http://localhost:3000)      │
│    └── Load index.html + script.js                             │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. ผู้ใช้พิมพ์ข้อความ → script.js ส่งไป Backend                │
│    └── Socket.IO emit('message', userMessage)                  │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. agent.ts รับข้อความ → ส่งไป AI (Google/OpenAI/Ollama)      │
│    └── buildMessages() สร้าง message array                      │
│    └── เรียก AI API พร้อม system prompt                        │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. AI ตอบกลับในรูป XML (Tool Calls)                           │
│    └── <IMG_Generate>, <SearchByDuckDuckGo> เป็นต้น            │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. agent.ts แปลง XML → JSON → เรียก api.ts                    │
│    └── xmlToJson() แปลง XML                                    │
│    └── callToolFunction() ส่งไปให้ tool                        │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. api.ts ตรวจสอบ tool name → เรียก function ที่เหมาะสม      │
│    └── IMG_Generate → เรียก Python API (/Generate)             │
│    └── SearchByDuckDuckGo → ค้นหาเว็บ                          │
│    └── ProcessDocument → เรียก Python API (/process)           │
│    └── ExecuteCommand → เรียก Local API (/command/execute)     │
│    └── TakeScreenshot → เรียก Local API (/screenshot)          │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Python API Server / Local API ประมวลผล → คืนผลลัพธ์        │
│    └── /Generate → สร้างรูป → คืน URL                          │
│    └── /process → แยกข้อความ → บันทึก Embedding               │
│    └── /system/info → ดึงข้อมูลระบบ                           │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. Backend (agent.ts) สร้าง Message เพิ่มผลลัพธ์               │
│    └── บันทึกประวัติใน PostgreSQL (chat_history)              │
│    └── บันทึกไฟล์ใน MinIO (uploaded_files)                    │
│    └── บันทึก Embedding ใน PostgreSQL (document_embeddings)  │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Backend ส่งคำตอบกลับผ่าน Socket.IO (real-time)            │
│    └── emit('message', aiResponse)                             │
└─────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Frontend (script.js) แสดงคำตอบบนหน้าจอ                    │
│     └── Update chat UI                                         │
│     └── เล่น sound notification (ถ้ามี)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 ไฟล์ตั้งค่าและสคริปต์

### **ไฟล์ติดตั้ง**

| ไฟล์ | ฟังก์ชัน |
|------|---------|
| **installenv.sh** | ติดตั้ง Python virtual environment (Linux) |
| **installenv.bat** | ติดตั้ง Python virtual environment (Windows) |
| **installnode.sh** | ติดตั้ง Node.js (Linux) |
| **installpostgres.sh** | ติดตั้ง PostgreSQL (Linux) |
| **installdocker.sh** | ติดตั้ง Docker & Docker Compose (Linux) |
| **install.sh** | ติดตั้งทั้งหมด (Linux) |
| **setup.sh** | Setup environment variables |

### **Dockerfile**

| Dockerfile | สำหรับ |
|------------|--------|
| **ai_agent_core/Dockerfile** | Build image สำหรับ Node.js Frontend/Backend |
| **api_server/Dockerfile** | Build image สำหรับ Python API Server |
| **api_local_server/Dockerfile** | Build image สำหรับ Local API Server (ถ้ามี) |

### **Entrypoint Scripts**

| สคริปต์ | ฟังก์ชัน |
|--------|---------|
| **ai_agent_core/scripts/entrypoint.sh** | เริ่มต้น app บน Linux |
| **ai_agent_core/scripts/entrypoint.bat** | เริ่มต้น app บน Windows |
| **ai_agent_core/scripts/entrypointDocker.sh** | เริ่มต้นภายใน Docker (Linux) |
| **ai_agent_core/scripts/entrypointDocker.bat** | เริ่มต้นภายใน Docker (Windows) |

---

## 🔑 Environment Variables

### **Database & Storage**
```
DATABASE_URL=postgresql://athip:123456@localhost:5432/ai_agent
MINIO_ENDPOINT=localhost:9000
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=uploads
```

### **AI Models**
```
Google_API_KEY=your_google_genai_api_key
OPENAI_API_KEY=your_openai_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
DEEPINFRA_API_KEY=your_deepinfra_api_key
API_OLLAMA=http://localhost:11434/api/generate
```

### **Application**
```
PORT=3000
API_SERVER_URL=http://localhost:5000
APP_SERVER=http://localhost:3000
```

---

## 🚀 วิธีรันโปรเจค

### **วิธีที่ 1: Docker (ค่อนข้างมา)**

```bash
# 1. Clone repository
git clone <repo_url>
cd LLM_Chatbot_With_Agent

# 2. รัน Frontend + Database + MinIO
docker-compose up -d --build

# 3. รัน Python API Server (อีก terminal)
docker-compose -f docker-compose_api_server.yml up -d --build

# 4. เปิดเบราว์เซอร์
# Frontend: http://localhost:3000
# MinIO Console: http://localhost:9090 (admin/minioadmin)
```

### **วิธีที่ 2: Local Installation (Linux/Mac)**

```bash
# 1. ติดตั้ง dependencies
./install.sh

# 2. ติดตั้ง Python packages
source env/bin/activate
pip install -r requirement.txt

# 3. ติดตั้ง Node packages
cd ai_agent_core
npm install

# 4. ตั้งค่า .env
export DATABASE_URL=postgresql://athip:123456@localhost:5432/ai_agent
export API_SERVER_URL=http://localhost:5000

# 5. เริ่มต้น PostgreSQL & MinIO
# (ต้องติดตั้งและรันแยก)

# 6. รัน Python API Server
python api_server/model.py

# 7. รัน Frontend (อีก terminal)
cd ai_agent_core
npm start
```

### **วิธีที่ 3: Windows Local Installation**

```batch
# 1. ติดตั้ง virtual environment
installenv.bat

# 2. ติดตั้ง Python packages
pip install -r requirement.txt

# 3. ติดตั้ง Node packages
cd ai_agent_core
npm install

# 4. ตั้งค่า .env
set DATABASE_URL=postgresql://athip:123456@localhost:5432/ai_agent
set API_SERVER_URL=http://localhost:5000

# 5. รัน Python API Server
python api_server/model.py

# 6. รัน Frontend (อีก terminal)
cd ai_agent_core
npm start
```

---

## 📦 Python Dependencies (requirement.txt)

### **LangChain & NLP**
- `langchain-text-splitters`
- `langchain-community`
- `langchain-core`
- `langgraph`
- `langchain[openai]`
- `langchain-openai`
- `langchain-ollama`
- `langchain-huggingface`

### **Models**
- `ollama`
- `openai`
- `transformers`
- `sentence-transformers`
- `modelscope`

### **Database & Storage**
- `psycopg2` (PostgreSQL driver)
- `chromadb` (Vector database)
- `minio` (Object storage)

### **Web & Document Processing**
- `flask`
- `pymupdf` (PDF reading)
- `docling` (Document parsing)
- `unstructured` (Document extraction)
- `selenium` (Web scraping)
- `beautifulsoup4` (HTML parsing)
- `duckduckgo_search` (Web search)
- `googlesearch-python`

### **Image & Deep Learning**
- `torch`
- `torchvision`
- `torchaudio`
- `pillow` (Image processing)
- `scikit-learn`

### **Utilities**
- `numpy`, `pandas`, `matplotlib`
- `scipy`, `sympy`
- `dotenv`

---

## 🎯 สรุปสั้น

| Component | เทคโนโลยี | พอร์ต | หน้าที่ |
|-----------|----------|------|--------|
| **Frontend** | HTML/CSS/JavaScript | 3000 | ส่วนติดต่อผู้ใช้ - Chat UI |
| **Backend** | Node.js + TypeScript | 3000 | จัดการ AI Logic + Tool Calling |
| **Database** | PostgreSQL + pgvector | 5432 | เก็บ users, chat, embeddings |
| **Storage** | MinIO | 9010/9090 | เก็บไฟล์ที่อัปโหลด |
| **Python API** | Flask + PyTorch | 5000 | ประมวลผลเอกสาร, สร้างรูป, ค้นหาเว็บ |
| **Local API** | Node.js | 3333 | ควบคุมเครื่องผู้ใช้ |
| **LLM** | Google/OpenAI/Ollama | - | ตัวประสาท AI |

---

## 🔄 Multi-method RAG (Retrieval Augmented Generation)

โปรเจคนี้รองรับ 2 วิธี RAG:

### **1. Text-based RAG** (ใช้ Model 1 + Model 2)
```
Document File
    ↓
Model 1: extract_pdf_text() / extract_docx_text()
    ↓ (ดึง text ออกมา)
Model 2: encode_text_for_embedding()
    ↓ (สร้าง Vector 1024 dims)
PostgreSQL pgvector
    ↓ (เก็บ Vector)
AI Query: "เนื้อหากล่าวอะไร?"
    ↓
Vector Search (similarity search)
    ↓
Get Top-K similar documents
    ↓
Pass to AI as Context
    ↓
AI generates answer
```

**ฟัง Model ที่เกี่ยว**:
- `HuggingFaceEmbeddings` (Default model)
- `OpenAIEmbeddings` (เมื่อ API_KEY มี)
- `SentenceTransformers` (All-MiniLM-L6-v2)

---

### **2. Image-based RAG** (สำหรับ PDF หลายหน้า)
```
PDF File
    ↓
Model 1: convert_pdf_page_to_image()
    ↓ (แปลงแต่ละหน้าเป็นรูป)
Model 2: get_clip_embedding() / process_pages_with_vlm()
    ↓ (สร้าง Embedding จากรูป)
PostgreSQL pgvector
    ↓ (เก็บ Page Embedding)
AI Query + Image Understanding
    ↓
Vector Search for images
    ↓
Get visual context
    ↓
AI generates detailed answer (เข้าใจ layout, chart, design)
```

**ฟังก์ชัน Model ที่เกี่ยว**:
- `CLIP` (Vision-Language Model)
- `VlmPipeline` (Docling's Vision-Language Pipeline)
- `process_pages_with_vlm()` (ประมวลผลหน้าด้วย VLM)

---

### **เทียบเคียง: Text-based vs Image-based**

| ลักษณะ | Text-based RAG | Image-based RAG |
|------|-------|--------|
| **Input** | PDF text extract | PDF pages as images |
| **Model ที่ใช้** | Sentence Transformer | CLIP + VLM |
| **ข้อมูลที่ได้** | Text content | Text + Layout + Visual design |
| **ความเข้าใจ** | ✅ เข้าใจ content | ✅ เข้าใจ content + รูปแบบ |
| **รูปภาพในเอกสาร** | ❌ ไม่เข้าใจ | ✅ เข้าใจและอธิบายได้ |
| **Chart/Diagram** | ❌ ไม่เห็น | ✅ เห็นและวิเคราะห์ได้ |
| **ความเร็ว** | ⚡ เร็ว | 🐢 ช้า (รอ VLM) |
| **GPU Memory** | 📊 ปกติ | 📊 สูง |

---

### **ขั้นตอนการทำงาน Dual-Model ใน api_server**

```python
# ที่ /process endpoint

# 1️⃣ รับไฟล์จากผู้ใช้
file = request.files['file']

# 2️⃣ ตัดสินใจ: ใช้ Mode ไหน?
if request.form.get('mode') == 'new_page_image':
    # ⬇️ Image-based RAG
    # Model 1: แปลง PDF page → Image
    images = convert_pdf_page_to_image(file)
    
    # Model 2: สร้าง Embedding จากรูป
    for img in images:
        embedding = get_clip_embedding(img)
        save_page_vector_to_db(embedding, page_num)
else:
    # ⬇️ Text-based RAG (default)
    # Model 1: แยกข้อความจาก PDF
    extracted_text = extract_pdf_text(file)
    
    # Model 2: สร้าง Embedding จากข้อความ
    embedding = encode_text_for_embedding(extracted_text)
    save_vector_to_db(extracted_text, embedding)

# 3️⃣ บันทึกไฟล์ต้นฉบับ ไป MinIO
upload_file_to_minio_and_db(file, user_id)

# 4️⃣ Return Success
return jsonify({"status": "processed"})
```

---

นี่ช่วยให้ AI เข้าใจเอกสารได้ดีขึ้น (รูปแบบ, layout, chart เป็นต้น)

---

## 🏭 ฟีเจอร์เพิ่มเติมสำหรับสายการผลิต (ยังไม่มีใน Code)

### **1️⃣ Machine Monitoring & Real-time Status**
```
GET /api/machines/{id}/status
Response: {
  "machine_id": "CNC-001",
  "status": "RUNNING",
  "temperature": 45.3,
  "vibration": 2.1,
  "power_usage": 15.5,
  "uptime_hours": 125.5 
}

User: "CNC Machine 001 สถานะเป็นไง"
Bot: "ทำงานปกติ - อุณหภูมิ 45.3°C, สั่นสะเทือน 2.1 m/s², ไฟ 15.5 kW"
```

### **2️⃣ Predictive Maintenance (ML-based)**
```
POST /api/machines/{id}/predict-failure
Response: {
  "failure_probability": 0.73,
  "risk_level": "HIGH",
  "estimated_days": 5-7,
  "action": "ตรวจ bearing ใน 48 ชั่วโมง"
}

User: "CNC 001 ต้องบำรุงรักษาเมื่อไหร่"
Bot: "⚠️ ความเสี่ยงสูง (73%) - จะขัดข้องใน 5-7 วัน"
```

### **3️⃣ Quality Control with AI Vision**
```
POST /api/qc/analyze-product
Response: {
  "defects_found": true,
  "defect_type": "Scratch",
  "severity": "MEDIUM",
  "recommendation": "REWORK"
}

User: "อัปโหลดรูปและตรวจสอบคุณภาพ"
Bot: "พบจุดเด่น: Scratch ที่มุมบนขวา - แนะนำ REWORK"
```

### **4️⃣ Production Schedule Optimization**
```
POST /api/production/optimize-schedule
Response: {
  "schedule": [...],
  "on_time_percentage": 100,
  "machine_utilization": 85,
  "makespan": "14:00"
}

User: "จัดตารางการผลิด 5 order วันนี้"
Bot: "สร้างตารางแล้ว - เสร็จตรงเวลา 100%, ใช้เครื่อง 85%"
```

### **5️⃣ Inventory Real-time Alerts**
```
GET /api/inventory/status
Response: {
  "items": [{
    "name": "Steel Plate",
    "current_stock": 8,
    "reorder_level": 20,
    "status": "LOW - ORDER SOON"
  }]
}

User: "สต็อกเหลือเท่าไหร่"
Bot: "Steel Plate เหลือ 8 แผ่น - ต้องสั่งแล้ว (Lead time 5 วัน)"
```

### **6️⃣ Energy & Cost Tracking**
```
GET /api/production/energy-usage
Response: {
  "kwh_used": 245.6,
  "total_cost": 3682.50,
  "efficiency": 87,
  "peak_hour": "14:00-15:00"
}

User: "วันนี้ใช้ไฟเท่าไหร่"
Bot: "245.6 kWh = 3,682 บาท (Efficiency 87%)"
```

### **7️⃣ Safety Compliance & Incident Reporting**
```
POST /api/safety/audit
Response: {
  "total_checks": 50,
  "passed": 48,
  "compliance": 96,
  "issues": ["PPE requirement violation"]
}

User: "ตรวจสอบ compliance"
Bot: "Compliance 96% - พบ 2 ประเด็นต้องแก้ไข"
```

### **8️⃣ Production KPIs Dashboard**
```
GET /api/production/analytics
Response: {
  "oee": 78.5,
  "defect_rate": 2.1,
  "on_time_delivery": 96.5,
  "downtime_hours": 12.5
}

User: "ประสิทธิภาพวันนี้เป็นไง"
Bot: "OEE 78.5%, Defect 2.1%, ส่งตรงเวลา 96.5%"
```

### **9️⃣ AI Troubleshooting Assistant**
```
POST /api/troubleshooting/diagnose
Input: ["เสียงแปลก", "สั่นสูง", "อุณหภูมิเพิ่ม"]
Response: {
  "probable_cause": "bearing failure",
  "probability": 0.85,
  "solution": ["ตรวจ bearing", "สั่ง part ใหม่"]
}

User: "Machine เสียงแปลก ช่วยวินิจฉัย"
Bot: "85% คือ bearing failure - ต้องตรวจใน 48 ชั่วโมง"
```

### **🔟 Manufacturing Document Management**
```
GET /api/documents/sop/CNC-001
Response: {
  "doc_id": "SOP-CNC-001",
  "version": 3.2,
  "content": "...",
  "last_updated": "2025-11-15"
}

User: "SOP การใช้ CNC Machine"
Bot: "[อ่านจาก SOP-CNC-001 v3.2]"
```

---

### **Database Schema สำหรับฟีเจอร์ใหม่**

```sql
-- Machines table
CREATE TABLE machines (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255),
    type VARCHAR(100),
    location VARCHAR(255),
    model VARCHAR(255),
    ip_address VARCHAR(45),
    protocol VARCHAR(50),  -- Modbus, OPC-UA, REST API, MQTT
    last_online TIMESTAMP,
    status VARCHAR(50)
);

-- Real-time sensor data
CREATE TABLE machine_sensors (
    id SERIAL PRIMARY KEY,
    machine_id INT REFERENCES machines(id),
    sensor_type VARCHAR(100),  -- temperature, vibration, power
    value FLOAT,
    unit VARCHAR(50),
    timestamp TIMESTAMP
);

-- Maintenance predictions
CREATE TABLE maintenance_predictions (
    id SERIAL PRIMARY KEY,
    machine_id INT REFERENCES machines(id),
    predicted_at TIMESTAMP,
    failure_probability FLOAT,
    risk_level VARCHAR(50),
    estimated_days INT,
    recommended_action TEXT
);

-- Production orders
CREATE TABLE production_orders (
    id SERIAL PRIMARY KEY,
    product_id INT,
    quantity INT,
    deadline TIMESTAMP,
    priority INT,
    status VARCHAR(50),
    assigned_machine INT REFERENCES machines(id),
    scheduled_start TIMESTAMP,
    scheduled_end TIMESTAMP
);

-- Inventory items
CREATE TABLE inventory_items (
    id SERIAL PRIMARY KEY,
    item_code VARCHAR(50) UNIQUE,
    item_name VARCHAR(255),
    category VARCHAR(100),
    current_quantity FLOAT,
    unit_of_measure VARCHAR(50),
    min_stock_level FLOAT,
    max_stock_level FLOAT,
    reorder_point FLOAT,
    supplier_id INT,
    lead_time_days INT
);

-- QC results
CREATE TABLE qc_results (
    id SERIAL PRIMARY KEY,
    batch_id INT,
    product_type VARCHAR(100),
    image_path VARCHAR(500),
    defects_found BOOLEAN,
    severity VARCHAR(50),
    recommendation VARCHAR(50),  -- PASS, REWORK, SCRAP
    timestamp TIMESTAMP
);

-- Production analytics
CREATE TABLE production_analytics (
    id SERIAL PRIMARY KEY,
    period_date DATE,
    total_units_produced INT,
    target_units INT,
    defect_rate FLOAT,
    oee FLOAT,
    downtime_hours FLOAT,
    on_time_delivery FLOAT,
    production_cost_per_unit FLOAT,
    availability FLOAT,
    performance FLOAT,
    quality FLOAT
);

-- Energy consumption
CREATE TABLE energy_consumption (
    id SERIAL PRIMARY KEY,
    machine_id INT REFERENCES machines(id),
    timestamp TIMESTAMP,
    power_kw FLOAT,
    duration_minutes INT,
    energy_kwh FLOAT,
    cost FLOAT
);

-- Manufacturing documents
CREATE TABLE manufacturing_documents (
    id SERIAL PRIMARY KEY,
    doc_id VARCHAR(100) UNIQUE,
    title VARCHAR(255),
    document_type VARCHAR(50),  -- SOP, BOM, SPECIFICATION
    current_version FLOAT,
    status VARCHAR(50),
    content_text TEXT,
    embeddings VECTOR(1024)
);
```

---

### **Python API Endpoints (ยังต้องสร้าง)**

```python
# api_server/endpoints/manufacturing.py

from flask import Blueprint, request, jsonify

manufacturing_bp = Blueprint('manufacturing', __name__)

# 1. Machine Status
@manufacturing_bp.route('/machines/<machine_id>/status', methods=['GET'])
def get_machine_status(machine_id):
    """ดึงสถานะเครื่องแบบ real-time"""
    status = db.query_machine_status(machine_id)
    return jsonify(status)

# 2. Predictive Maintenance
@manufacturing_bp.route('/machines/<machine_id>/predict-failure', methods=['POST'])
def predict_failure(machine_id):
    """ทำนายความเสี่ยงขัดข้อง"""
    predictor = PredictiveMaintenanceModel()
    result = predictor.predict_failure_risk(machine_id)
    return jsonify(result)

# 3. Quality Control
@manufacturing_bp.route('/qc/analyze-product', methods=['POST'])
def analyze_product_qc():
    """วิเคราะห์ QC ด้วย AI Vision"""
    file = request.files['image']
    product_type = request.form.get('product_type', 'generic')
    analyzer = QCAnalyzer()
    result = analyzer.analyze_product(file, product_type)
    return jsonify(result)

# 4. Production Schedule
@manufacturing_bp.route('/production/optimize-schedule', methods=['POST'])
def optimize_schedule():
    """จัดตารางการผลิตอัตโนมัติ"""
    orders = request.json.get('orders')
    scheduler = ProductionScheduler()
    result = scheduler.optimize_schedule()
    return jsonify(result)

# 5. Inventory Status
@manufacturing_bp.route('/inventory/status', methods=['GET'])
def get_inventory_status():
    """แสดงระดับสต็อก"""
    inventory = db.query_inventory_status()
    return jsonify(inventory)

# 6. Energy Tracking
@manufacturing_bp.route('/production/energy-usage', methods=['GET'])
def get_energy_usage():
    """ติดตามพลังงาน"""
    energy = db.query_energy_consumption()
    return jsonify(energy)

# 7. Safety Audit
@manufacturing_bp.route('/safety/audit', methods=['POST'])
def safety_audit():
    """ตรวจสอบ compliance"""
    result = perform_safety_audit()
    return jsonify(result)

# 8. Production Analytics
@manufacturing_bp.route('/production/analytics', methods=['GET'])
def get_production_analytics():
    """แสดง KPIs"""
    analytics = db.query_production_analytics()
    return jsonify(analytics)

# 9. Troubleshooting
@manufacturing_bp.route('/troubleshooting/diagnose', methods=['POST'])
def diagnose_machine():
    """วินิจฉัยปัญหาเครื่องจักร"""
    symptoms = request.json.get('symptoms')
    assistant = TroubleshootingAssistant()
    diagnosis = assistant.diagnose_fault(symptoms)
    return jsonify(diagnosis)

# 10. Documents
@manufacturing_bp.route('/documents/<doc_id>', methods=['GET'])
def get_document(doc_id):
    """ดึงเอกสาร SOP/BOM"""
    doc = db.query_document(doc_id)
    return jsonify(doc)
```

---

## ✨ ฟีเจอร์พิเศษ

- ✅ **Real-time Chat** - Socket.IO websocket
- ✅ **Multi-user Support** - Session management
- ✅ **File Handling** - Upload/download อัตโนมัติ
- ✅ **Multiple LLM Support** - Google/OpenAI/Ollama
- ✅ **Dual-method RAG** - Text + Image-based
- ✅ **System Control** - ควบคุมเครื่องผู้ใช้
- ✅ **Web Scraping** - Selenium automation
- ✅ **Image Generation** - DDPM diffusion model
- ✅ **Object Detection** - Grounding DINO
- ✅ **Docker Support** - Easy deployment
- ✅ **Guest User** - ไม่ต้อง login
- ✅ **Auto Cleanup** - ลบข้อมูล guest เก่า

---

## 📝 Notes

1. **Default Credentials**:
   - PostgreSQL: user=`athip`, password=`123456`, database=`ai_agent`
   - MinIO: access_key=`minioadmin`, secret_key=`minioadmin`

2. **Token Limits**:
   - Google GenAI: ~30k tokens
   - OpenAI: ขึ้นอยู่กับ model (GPT-3.5: 4k, GPT-4: 8k/32k/128k)
   - Ollama: ขึ้นอยู่กับ model ที่ pull

3. **Performance**:
   - Embedding generation: ~ 1-5 วินาที ต่อ 1000 tokens
   - Image generation: ~ 10-30 วินาที
   - Web scraping: ~ 2-10 วินาที

4. **Storage**:
   - Vector DB: ใช้ pgvector (PostgreSQL extension)
   - File Storage: MinIO (S3-compatible)

---

## 🆘 Troubleshooting

| ปัญหา | วิธีแก้ |
|-----|--------|
| Connection refused port 5432 | ตรวจสอบ PostgreSQL running |
| MINIO_ENDPOINT not found | ตรวจสอบ MinIO config ใน .env |
| GPU out of memory | ลด batch size หรือใช้ CPU mode |
| Embedding dimension mismatch | ตรวจสอบ model ที่ใช้ (HuggingFace/OpenAI) |
| Timeout on web scraping | เพิ่ม timeout หรือลองใช้ URL อื่น |
| Session expired | Reload page หรือ login ใหม่ |

---

## 📚 References

- [LangChain Docs](https://python.langchain.com/)
- [PostgreSQL pgvector](https://github.com/pgvector/pgvector)
- [MinIO Documentation](https://docs.min.io/)
- [Express.js Guide](https://expressjs.com/)
- [Ollama Models](https://ollama.ai/library)
- [PyTorch Documentation](https://pytorch.org/docs/)

---

**Created**: December 1, 2025  
**Version**: 1.0  
**License**: [Add License Info]


