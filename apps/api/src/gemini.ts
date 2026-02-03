import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('Warning: GEMINI_API_KEY not set. RAG features will be disabled.');
}

// Initialize Gemini client
export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// Embedding model - text-embedding-004 outputs 768 dimensions
export const embeddingModel = genAI?.getGenerativeModel({ model: 'text-embedding-004' });

// Chat model - Gemini 1.5 Flash for fast responses
export const chatModel = genAI?.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Check if Gemini is enabled
export const isGeminiEnabled = () => !!genAI;

/**
 * Generate embeddings for text using Gemini
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!embeddingModel) {
    console.warn('Gemini embedding model not available');
    return null;
  }

  try {
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  if (!embeddingModel) {
    return texts.map(() => null);
  }

  try {
    const results = await Promise.all(
      texts.map(text => generateEmbedding(text))
    );
    return results;
  } catch (error) {
    console.error('Error generating batch embeddings:', error);
    return texts.map(() => null);
  }
}

/**
 * Chat with Gemini
 */
export async function chatWithGemini(
  systemPrompt: string,
  context: string,
  userMessage: string,
  history: Array<{ role: 'user' | 'model'; content: string }> = []
): Promise<string> {
  if (!chatModel) {
    throw new Error('Gemini chat model not available');
  }

  try {
    // Build the full prompt with system instructions and context
    const fullPrompt = `${systemPrompt}

--- CONTEXT ---
${context}
--- END CONTEXT ---

Based on the context above, please answer the following question. If the answer is not in the context, say so clearly.

User: ${userMessage}`;

    // For simple single-turn, just generate content
    if (history.length === 0) {
      const result = await chatModel.generateContent(fullPrompt);
      return result.response.text();
    }

    // For multi-turn conversations, use chat
    const chat = chatModel.startChat({
      history: history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      })),
    });

    const result = await chat.sendMessage(fullPrompt);
    return result.response.text();
  } catch (error) {
    console.error('Error chatting with Gemini:', error);
    throw error;
  }
}

console.log(`Gemini AI: ${isGeminiEnabled() ? 'Enabled' : 'Disabled (no API key)'}`);
