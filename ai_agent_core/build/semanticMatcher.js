/**
 * Semantic Matcher Module
 * ======================
 *
 * Provides advanced semantic search capabilities beyond simple vector similarity.
 * Combines multiple signals for better question matching:
 *
 * 1. Intent Detection (7 types):
 *    - definition, howto, troubleshooting, comparison, recommendation, explanation, listing
 *
 * 2. Keyword Matching:
 *    - Extract important keywords (stopwords removed)
 *    - Calculate keyword overlap score
 *    - BM25-style scoring for ranking
 *
 * 3. Freshness Scoring:
 *    - Exponential decay with 180-day half-life
 *    - Prioritize recent knowledge
 *
 * 4. Hybrid Search:
 *    - Vector Similarity: 55%
 *    - Keyword Matching: 30%
 *    - Freshness: 15%
 */
// ========== CONSTANTS ==========
const INTENT_PATTERNS = {
    definition: [
        /^(?:what|define|meaning|คือ|หมายถึง|อะไร)/i,
        /(?:definition|defined as|means that)/i,
        /(?:อธิบาย|ความหมาย|นิยาม)/i
    ],
    howto: [
        /^(?:how to|วิธี|ทำอย่างไร|ทำยังไง)/i,
        /(?:steps|procedure|process|guide)/i,
        /(?:ขั้นตอน|กระบวนการ|แนวทาง)/i
    ],
    troubleshooting: [
        /(?:error|problem|issue|fix|solve|debug)/i,
        /(?:ปัญหา|แก้ไข|ซ่อม|เกิดข้อผิดพลาด)/i,
        /(?:why.*not working|doesn't work|failed)/i
    ],
    comparison: [
        /(?:compare|difference|versus|vs|better|worse)/i,
        /(?:เปรียบเทียบ|ต่าง|ดีกว่า|แย่กว่า)/i,
        /(?:between|comparison of)/i
    ],
    recommendation: [
        /(?:recommend|suggest|best|should|which)/i,
        /(?:แนะนำ|เลือก|ควร|ดีที่สุด)/i,
        /(?:advice|opinion)/i
    ],
    explanation: [
        /^(?:why|explain|reason|cause)/i,
        /(?:ทำไม|เพราะ|สาเหตุ|เหตุผล)/i,
        /(?:because|due to|explanation)/i
    ],
    listing: [
        /(?:list|types|kinds|examples|categories)/i,
        /(?:รายการ|ประเภท|ชนิด|ตัวอย่าง)/i,
        /(?:what are|name the)/i
    ]
};
// Thai and English stopwords
const STOPWORDS = new Set([
    // English
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
    'could', 'can', 'may', 'might', 'must', 'shall', 'of', 'at', 'by', 'for',
    'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before',
    'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on',
    'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
    'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 's', 't', 'just', 'don', 'now', 'i', 'you', 'he',
    'she', 'it', 'they', 'them', 'their', 'what', 'which', 'who', 'this', 'that',
    'these', 'those', 'am', 'or', 'as', 'if', 'any', 'and', 'but', 'because',
    // Thai (common particles and function words)
    'ที่', 'ใน', 'การ', 'เป็น', 'ของ', 'มี', 'ได้', 'จาก', 'และ', 'ให้', 'ต้อง',
    'จะ', 'อยู่', 'ไป', 'มา', 'แล้ว', 'ด้วย', 'ถึง', 'แต่', 'ว่า', 'คือ', 'ซึ่ง',
    'อื่น', 'นี้', 'นั้น', 'เหล่า', 'บาง', 'ทุก', 'หลาย', 'ไม่', 'หรือ', 'ถ้า',
    'เพราะ', 'เนื่อง', 'ตั้งแต่', 'โดย', 'ตาม', 'เพื่อ', 'กับ', 'ยัง', 'ก็', 'เท่า',
    'เช่น', 'ดัง', 'กว่า', 'สุด', 'อัน', 'ตัว', 'กัน', 'ขึ้น', 'ลง', 'ออก', 'เข้า'
]);
// ========== INTENT DETECTION ==========
/**
 * Detect the intent/purpose of a question
 * Returns the most likely intent type and confidence score
 */
export function detectIntent(question) {
    const normalizedQuestion = question.toLowerCase().trim();
    // Score each intent type
    const scores = {
        definition: 0,
        howto: 0,
        troubleshooting: 0,
        comparison: 0,
        recommendation: 0,
        explanation: 0,
        listing: 0
    };
    // Check patterns for each intent type
    for (const [intentType, patterns] of Object.entries(INTENT_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(normalizedQuestion)) {
                scores[intentType] += 1;
            }
        }
    }
    // Find the highest scoring intent
    let maxScore = 0;
    let detectedIntent = 'general';
    for (const [intentType, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            detectedIntent = intentType;
        }
    }
    // Calculate confidence (normalize by max possible matches)
    const maxPatterns = Math.max(...Object.values(INTENT_PATTERNS).map(p => p.length));
    const confidence = maxScore > 0 ? Math.min(maxScore / maxPatterns, 1.0) : 0;
    return {
        type: detectedIntent,
        confidence
    };
}
// ========== KEYWORD EXTRACTION ==========
/**
 * Extract important keywords from text
 * Removes stopwords and short words, normalizes case
 */
export function extractKeywords(text) {
    // Tokenize (split by whitespace and punctuation)
    const words = text
        .toLowerCase()
        .replace(/[^\w\sก-๙]/g, ' ') // Keep Thai and English chars
        .split(/\s+/)
        .filter(word => {
        // Filter: minimum length 2, not a stopword, not a number
        return word.length >= 2 &&
            !STOPWORDS.has(word) &&
            !/^\d+$/.test(word);
    });
    // Remove duplicates while preserving order
    return [...new Set(words)];
}
/**
 * Calculate keyword overlap score between two texts
 * Returns score 0-1 based on how many keywords match
 */
export function calculateKeywordScore(text1, text2) {
    const keywords1 = extractKeywords(text1);
    const keywords2 = extractKeywords(text2);
    if (keywords1.length === 0 || keywords2.length === 0) {
        return {
            keywords: keywords1,
            score: 0,
            matchedCount: 0,
            totalCount: keywords1.length
        };
    }
    // Create set for faster lookup
    const set2 = new Set(keywords2);
    // Count matches
    const matchedCount = keywords1.filter(kw => set2.has(kw)).length;
    // Jaccard similarity: intersection / union
    const unionSize = new Set([...keywords1, ...keywords2]).size;
    const score = matchedCount / unionSize;
    return {
        keywords: keywords1,
        score,
        matchedCount,
        totalCount: keywords1.length
    };
}
/**
 * Calculate BM25-style score for keyword matching
 * More sophisticated than simple overlap - considers term frequency
 *
 * BM25 formula (simplified):
 * score = sum of (IDF * (tf * (k+1)) / (tf + k * (1 - b + b * (docLen / avgDocLen))))
 *
 * For simplicity, we use a modified version focusing on term frequency
 */
export function calculateBM25Score(queryKeywords, docText, k = 1.5, b = 0.75) {
    const docKeywords = extractKeywords(docText);
    const docLen = docKeywords.length;
    const avgDocLen = 50; // Assume average document length
    if (queryKeywords.length === 0 || docLen === 0) {
        return 0;
    }
    // Count term frequencies in document
    const termFreq = new Map();
    for (const term of docKeywords) {
        termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }
    let score = 0;
    for (const term of queryKeywords) {
        const tf = termFreq.get(term) || 0;
        if (tf > 0) {
            // Simplified BM25 (without IDF since we don't have corpus stats)
            const numerator = tf * (k + 1);
            const denominator = tf + k * (1 - b + b * (docLen / avgDocLen));
            score += numerator / denominator;
        }
    }
    // Normalize to 0-1 range
    return Math.min(score / queryKeywords.length, 1.0);
}
// ========== FRESHNESS SCORING ==========
/**
 * Calculate freshness score based on age of content
 * Uses exponential decay with 180-day half-life
 *
 * Formula: score = 0.5 ^ (age_days / half_life_days)
 *
 * Examples:
 * - 0 days old: 1.0
 * - 180 days old: 0.5
 * - 360 days old: 0.25
 * - 720 days old: 0.0625
 */
export function calculateFreshnessScore(createdAt, halfLifeDays = 180) {
    const now = new Date();
    const ageMs = now.getTime() - createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    // Exponential decay
    const score = Math.pow(0.5, ageDays / halfLifeDays);
    // Clamp to 0.01 minimum (don't completely discount old content)
    return Math.max(score, 0.01);
}
export function hybridSemanticSearch(query, vectorResults, options = {}) {
    const { vectorWeight = 0.55, keywordWeight = 0.30, freshnessWeight = 0.15, minConfidence = 0.25, intentMatching = true } = options;
    // Detect query intent
    const queryIntent = detectIntent(query);
    const queryKeywords = extractKeywords(query);
    console.log(`🔍 Hybrid Search: query="${query.substring(0, 50)}..."`);
    console.log(`   Intent: ${queryIntent.type} (${(queryIntent.confidence * 100).toFixed(0)}%)`);
    console.log(`   Keywords: [${queryKeywords.join(', ')}]`);
    // Process each result
    const hybridResults = vectorResults.map(result => {
        // 1. Vector score (already provided)
        const vectorScore = result.similarity || 0;
        // 2. Keyword score (combine Jaccard + BM25)
        const keywordMatch = calculateKeywordScore(query, result.question);
        const bm25Score = calculateBM25Score(queryKeywords, result.question + ' ' + result.answer);
        const keywordScore = (keywordMatch.score * 0.6) + (bm25Score * 0.4);
        // 3. Freshness score
        const createdAt = result.created_at ? new Date(result.created_at) : new Date();
        const freshnessScore = calculateFreshnessScore(createdAt);
        // 4. Intent matching bonus
        let intentBonus = 0;
        if (intentMatching && queryIntent.confidence > 0.5) {
            const resultIntent = detectIntent(result.question);
            if (resultIntent.type === queryIntent.type) {
                intentBonus = 0.1 * queryIntent.confidence; // Up to 10% bonus
            }
        }
        // 5. Calculate weighted confidence score
        const confidenceScore = Math.min((vectorScore * vectorWeight) +
            (keywordScore * keywordWeight) +
            (freshnessScore * freshnessWeight) +
            intentBonus, 1.0);
        // 6. Determine match reason
        let matchReason = '';
        if (vectorScore > 0.7) {
            matchReason = 'High semantic similarity';
        }
        else if (keywordScore > 0.5) {
            matchReason = `Keyword match (${keywordMatch.matchedCount}/${keywordMatch.totalCount} keywords)`;
        }
        else if (intentBonus > 0) {
            matchReason = `Same intent type (${queryIntent.type})`;
        }
        else {
            matchReason = 'Partial match';
        }
        return {
            ...result,
            vectorScore,
            keywordScore,
            freshnessScore,
            confidenceScore,
            intent: queryIntent,
            keywordMatch,
            matchReason
        };
    });
    // Filter by minimum confidence
    const filtered = hybridResults.filter(r => r.confidenceScore >= minConfidence);
    // Sort by confidence score (descending)
    filtered.sort((a, b) => b.confidenceScore - a.confidenceScore);
    console.log(`   Results: ${vectorResults.length} → ${filtered.length} (after filter ≥${minConfidence})`);
    if (filtered.length > 0) {
        console.log(`   Top result: confidence=${(filtered[0].confidenceScore * 100).toFixed(1)}% [vec:${(filtered[0].vectorScore * 100).toFixed(0)}% kw:${(filtered[0].keywordScore * 100).toFixed(0)}% fresh:${(filtered[0].freshnessScore * 100).toFixed(0)}%]`);
    }
    return filtered;
}
// ========== INTENT-BASED FILTERING ==========
/**
 * Filter results by intent type
 * Useful for narrowing down results when intent is clear
 */
export function filterByIntent(results, targetIntent, minIntentConfidence = 0.5) {
    return results.filter(result => {
        const resultIntent = detectIntent(result.question);
        return resultIntent.type === targetIntent &&
            resultIntent.confidence >= minIntentConfidence;
    });
}
// ========== EXPLANATION HELPERS ==========
/**
 * Generate human-readable explanation of match
 */
export function explainMatch(result) {
    const parts = [];
    if (result.vectorScore > 0.7) {
        parts.push(`🎯 Semantic similarity: ${(result.vectorScore * 100).toFixed(0)}%`);
    }
    if (result.keywordScore > 0.3 && result.keywordMatch) {
        parts.push(`🔑 Keyword match: ${result.keywordMatch.matchedCount}/${result.keywordMatch.totalCount} keywords`);
    }
    if (result.intent && result.intent.confidence > 0.5) {
        parts.push(`💡 Intent: ${result.intent.type}`);
    }
    if (result.freshnessScore > 0.5) {
        parts.push(`🆕 Recent (freshness: ${(result.freshnessScore * 100).toFixed(0)}%)`);
    }
    return parts.join(' • ');
}
/**
 * Get confidence level label
 */
export function getConfidenceLevel(score) {
    if (score >= 0.70)
        return 'high';
    if (score >= 0.50)
        return 'medium';
    return 'low';
}
/**
 * Get confidence color for UI
 */
export function getConfidenceColor(score) {
    if (score >= 0.70)
        return '#10b981'; // green
    if (score >= 0.50)
        return '#f59e0b'; // orange
    return '#6b7280'; // gray
}
