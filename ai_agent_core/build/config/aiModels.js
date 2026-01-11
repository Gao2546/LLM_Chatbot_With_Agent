/**
 * AI Models Configuration
 * ไฟล์นี้ใช้กำหนด model สำหรับ AI ต่างๆ ในระบบ
 * สามารถ override ผ่าน Environment Variables ได้
 *
 * Usage:
 *   - Local: แก้ค่า default ด้านล่าง หรือตั้ง env variable
 *   - Docker: ตั้ง env variable ใน docker-compose.yml
 */
// ============================================
// AI SUGGESTS - สร้างคำตอบแนะนำ
// ============================================
export const AI_SUGGESTS_CONFIG = {
    // Primary model (Google AI API)
    primaryModel: process.env.AI_SUGGESTS_PRIMARY_MODEL || 'gemini-2.0-flash',
    // Fallback model (Ollama - Local)
    fallbackModel: process.env.AI_SUGGESTS_FALLBACK_MODEL || 'llama3:latest',
    // Display name for fallback
    fallbackDisplayName: process.env.AI_SUGGESTS_FALLBACK_NAME || 'llama3:latest (Ollama)',
};
// ============================================
// AI JUDGE - เปรียบเทียบคำตอบ AI vs Human
// ============================================
export const AI_JUDGE_CONFIG = {
    // Primary model (Google AI API)
    primaryModel: process.env.AI_JUDGE_PRIMARY_MODEL || 'gemini-2.0-flash',
    // Fallback model (Ollama - Local)
    fallbackModel: process.env.AI_JUDGE_FALLBACK_MODEL || 'llama3:latest',
    // Display name for fallback
    fallbackDisplayName: process.env.AI_JUDGE_FALLBACK_NAME || 'llama3:latest (Ollama)',
};
// ============================================
// ANSWER SYNTHESIS - สังเคราะห์คำตอบจากหลาย verification
// ============================================
export const AI_SYNTHESIS_CONFIG = {
    // Primary model (Google AI API)
    primaryModel: process.env.AI_SYNTHESIS_PRIMARY_MODEL || 'gemini-2.0-flash',
    // Fallback model (Ollama - Local)
    fallbackModel: process.env.AI_SYNTHESIS_FALLBACK_MODEL || 'llama3:latest',
    // Display name for fallback
    fallbackDisplayName: process.env.AI_SYNTHESIS_FALLBACK_NAME || 'llama3:latest (Ollama)',
};
// ============================================
// KNOWLEDGE GROUP CLASSIFICATION - จัดกลุ่มคำถาม
// ============================================
export const AI_CLASSIFICATION_CONFIG = {
    // Model for classification (Ollama preferred for speed)
    model: process.env.AI_CLASSIFICATION_MODEL || 'llama3:latest',
};
// ============================================
// DOCKER DEPLOYMENT PRESETS
// ============================================
// สำหรับ Deploy บน Docker ที่มี gemma3:4b
export const DOCKER_PRESET = {
    AI_SUGGESTS_FALLBACK_MODEL: 'gemma3:4b',
    AI_SUGGESTS_FALLBACK_NAME: 'gemma3:4b (Ollama)',
    AI_JUDGE_FALLBACK_MODEL: 'gemma3:4b',
    AI_JUDGE_FALLBACK_NAME: 'gemma3:4b (Ollama)',
    AI_SYNTHESIS_FALLBACK_MODEL: 'gemma3:4b',
    AI_SYNTHESIS_FALLBACK_NAME: 'gemma3:4b (Ollama)',
    AI_CLASSIFICATION_MODEL: 'gemma3:4b',
};
// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * Get model config based on environment
 */
export function getModelConfig() {
    return {
        suggests: AI_SUGGESTS_CONFIG,
        judge: AI_JUDGE_CONFIG,
        synthesis: AI_SYNTHESIS_CONFIG,
        classification: AI_CLASSIFICATION_CONFIG,
    };
}
/**
 * Log current model configuration
 */
export function logModelConfig() {
    console.log('🤖 AI Models Configuration:');
    console.log('   AI Suggests:');
    console.log(`     - Primary: ${AI_SUGGESTS_CONFIG.primaryModel}`);
    console.log(`     - Fallback: ${AI_SUGGESTS_CONFIG.fallbackModel}`);
    console.log('   AI Judge:');
    console.log(`     - Primary: ${AI_JUDGE_CONFIG.primaryModel}`);
    console.log(`     - Fallback: ${AI_JUDGE_CONFIG.fallbackModel}`);
    console.log('   AI Synthesis:');
    console.log(`     - Primary: ${AI_SYNTHESIS_CONFIG.primaryModel}`);
    console.log(`     - Fallback: ${AI_SYNTHESIS_CONFIG.fallbackModel}`);
    console.log('   AI Classification:');
    console.log(`     - Model: ${AI_CLASSIFICATION_CONFIG.model}`);
}
export default {
    suggests: AI_SUGGESTS_CONFIG,
    judge: AI_JUDGE_CONFIG,
    synthesis: AI_SYNTHESIS_CONFIG,
    classification: AI_CLASSIFICATION_CONFIG,
    logConfig: logModelConfig,
};
