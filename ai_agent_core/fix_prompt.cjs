const fs = require('fs');
const file = 'src/agent.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace Thai prompt
const oldThaiPattern = /🌐 \*\*ภาษา: ตอบเป็นภาษาไทยเท่านั้น\*\* \(เพราะคำถามเป็นภาษาไทย\)[\s\S]*?========== ข้อมูลอ้างอิงจากฐานความรู้ ==========/g;

const newThaiPrompt = `ภาษา: ตอบเป็นภาษาไทยเท่านั้น

วิธีการตอบ:
- ตอบเป็นธรรมชาติ เหมือนอธิบายให้เพื่อนฟัง
- ใช้ภาษาง่ายๆ อ่านเข้าใจง่าย
- ตอบตรงประเด็น กระชับ ไม่ยืดเยื้อ
- ถ้าจำเป็นต้องแบ่งข้อ ใช้แค่ 1. 2. 3. หรือ - เท่านั้น
- ความยาว 100-200 คำ

ข้อจำกัด:
- ใช้ข้อมูลจากฐานความรู้เป็นหลัก
- ถ้าข้อมูลไม่ตรงกับคำถาม ให้ตอบว่า "ไม่มีข้อมูลในฐานความรู้ที่ตรงกับคำถามนี้"

ห้ามทำอย่างเด็ดขาด:
- ห้ามใช้ emoji หรือ icon ใดๆ ทั้งสิ้น
- ห้ามใช้ตัวหนามากเกินไป
- ห้ามถามกลับผู้ใช้
- ห้ามแนะนำหัวข้อต่อ
- ห้ามใช้หัวข้อแบบ "สรุป:" "หลักการ:" "ข้อควรระวัง:" ฯลฯ
- ตอบให้จบในตัวเอง

ข้อมูลอ้างอิงจากฐานความรู้:`;

if (oldThaiPattern.test(content)) {
  content = content.replace(oldThaiPattern, newThaiPrompt);
  console.log('Thai prompt replaced!');
} else {
  console.log('Thai old pattern not found');
}

// Replace English prompt
const oldEnglishPattern = /🌐 \*\*CRITICAL - LANGUAGE INSTRUCTION:\*\*[\s\S]*?========== Reference Data from Knowledge Base ==========/g;

const newEnglishPrompt = `LANGUAGE: Answer in ENGLISH ONLY because the question is in English.
Translate Thai content to English if needed.

How to Answer:
- Answer naturally, like explaining to a friend
- Use simple, easy-to-understand language
- Be direct and concise
- If you need to list items, use simple 1. 2. 3. or - only
- Length: 100-200 words

Constraints:
- Use knowledge base data as the primary source
- If data doesn't match, respond: "No relevant data found in knowledge base for this question"

STRICTLY FORBIDDEN:
- Do NOT use ANY emoji or icons at all
- Do NOT overuse bold formatting
- Do NOT ask follow-up questions
- Do NOT suggest related topics
- Do NOT use headline style like "Summary:", "Key Points:", "Principle:"
- Answer completely and end definitively

Reference Data from Knowledge Base:`;

if (oldEnglishPattern.test(content)) {
  content = content.replace(oldEnglishPattern, newEnglishPrompt);
  console.log('English prompt replaced!');
} else {
  console.log('English old pattern not found');
}

fs.writeFileSync(file, content, 'utf8');
console.log('File saved!');
