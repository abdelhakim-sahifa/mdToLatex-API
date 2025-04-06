const express = require('express');
const admin = require('firebase-admin');
const axios = require('axios');
const cors = require('cors');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBDdlxEi_sbc2NrjSXt9cP2cDVzJBL_WDY",
    authDomain: "theprojectsofc.firebaseapp.com",
    databaseURL: "https://theprojectsofc-default-rtdb.firebaseio.com",
    projectId: "theprojectsofc",
    storageBucket: "theprojectsofc.firebasestorage.app",
    messagingSenderId: "825970426844",
    appId: "1:825970426844:web:cca1e93a8b654e4269c519",
    measurementId: "G-86RLL7LL6P"
};

// Gemini Configuration
const geminiConfiguration = {
    API_KEY: "AIzaSyD_O4lwncp26AnF3uYYI3dTiZbYdZlaRx4",
    BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key="
};

// Initialize Firebase
admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json')),
    databaseURL: firebaseConfig.databaseURL
});

const database = admin.database();

// API endpoint to convert MD to LaTeX with execution time logging
app.post('/api/convert-to-latex', async (req, res) => {
    const totalStartTime = Date.now();
    console.log(`[${new Date().toISOString()}] Starting conversion request`);
    
    try {
        const { fileId } = req.body;
        
        if (!fileId) {
            console.log(`[${new Date().toISOString()}] Missing fileId - Request failed in ${Date.now() - totalStartTime}ms`);
            return res.status(400).json({ error: 'File ID is required' });
        }
        
        console.log(`[${new Date().toISOString()}] Fetching markdown for fileId: ${fileId}`);
        const firebaseStartTime = Date.now();
        
        // Get the markdown content from Firebase
        const snapshot = await database.ref(`mdfiles/${fileId}/content`).once('value');
        const content = snapshot.val();
        
        const firebaseDuration = Date.now() - firebaseStartTime;
        console.log(`[${new Date().toISOString()}] Firebase fetch completed in ${firebaseDuration}ms`);
        
        if (!content) {
            console.log(`[${new Date().toISOString()}] Markdown content not found - Request failed in ${Date.now() - totalStartTime}ms`);
            return res.status(404).json({ error: 'Markdown content not found' });
        }
        
        console.log(`[${new Date().toISOString()}] Starting Gemini API conversion`);
        console.log(`[${new Date().toISOString()}] Markdown content length: ${content.length} characters`);
        
        // Convert markdown to LaTeX using Gemini
        const geminiStartTime = Date.now();
        const latexContent = await convertToLatex(content);
        const geminiDuration = Date.now() - geminiStartTime;
        
        console.log(`[${new Date().toISOString()}] Gemini API conversion completed in ${geminiDuration}ms`);
        console.log(`[${new Date().toISOString()}] LaTeX content length: ${latexContent.length} characters`);
        
        // Return the LaTeX content
        const totalDuration = Date.now() - totalStartTime;
        console.log(`[${new Date().toISOString()}] Total request completed in ${totalDuration}ms`);
        
        res.json({ 
            original: content,
            latex: latexContent,
            timings: {
                total: totalDuration,
                firebase: firebaseDuration,
                gemini: geminiDuration
            }
        });
        
    } catch (error) {
        const totalDuration = Date.now() - totalStartTime;
        console.error(`[${new Date().toISOString()}] Error converting to LaTeX after ${totalDuration}ms:`, error);
        res.status(500).json({ 
            error: 'Failed to convert to LaTeX', 
            details: error.message,
            timing: `Failed after ${totalDuration}ms`
        });
    }
});

// Function to convert markdown to LaTeX using Gemini with timeout
async function convertToLatex(markdownContent) {
    const functionStartTime = Date.now();
    try {
        const url = `${geminiConfiguration.BASE_URL}${geminiConfiguration.API_KEY}`;
        
        const payload = {
            contents: [
                {
                    parts: [
                        {
                            text: `Convert the following Markdown content to LaTeX format, maintaining all formatting, equations, tables, and structure. Ensure proper handling of Markdown features like headers, lists, code blocks, and emphasis. Here's the Markdown content to convert:\n\n${markdownContent}`
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.2,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 8192
            }
        };
        
        console.log(`[${new Date().toISOString()}] Sending request to Gemini API`);
        
        // Set timeout for Gemini API request (9 seconds to stay under Vercel's limit)
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 9000 // 9 seconds timeout
        });
        
        console.log(`[${new Date().toISOString()}] Gemini API response received in ${Date.now() - functionStartTime}ms`);
        
        // Extract the LaTeX content from Gemini's response
        const latexContent = response.data.candidates[0].content.parts[0].text;
        return latexContent;
        
    } catch (error) {
        const errorTime = Date.now() - functionStartTime;
        
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
            console.error(`[${new Date().toISOString()}] Gemini API timed out after ${errorTime}ms`);
            throw new Error(`Gemini API request timed out after ${errorTime}ms`);
        }
        
        console.error(`[${new Date().toISOString()}] Error calling Gemini API after ${errorTime}ms:`, error);
        throw new Error(`Failed to convert markdown to LaTeX after ${errorTime}ms: ${error.message}`);
    }
}

// Additional utility to save the converted LaTeX content back to Firebase
app.post('/api/save-latex', async (req, res) => {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] Starting save-latex request`);
    
    try {
        const { fileId, latexContent } = req.body;
        
        if (!fileId || !latexContent) {
            console.log(`[${new Date().toISOString()}] Missing required fields - Request failed in ${Date.now() - startTime}ms`);
            return res.status(400).json({ error: 'File ID and LaTeX content are required' });
        }
        
        console.log(`[${new Date().toISOString()}] Saving LaTeX for fileId: ${fileId}`);
        const firebaseStartTime = Date.now();
        
        // Save the LaTeX content to Firebase
        await database.ref(`latexfiles/${fileId}/content`).set(latexContent);
        await database.ref(`latexfiles/${fileId}/timestamp`).set(admin.database.ServerValue.TIMESTAMP);
        
        const firebaseDuration = Date.now() - firebaseStartTime;
        console.log(`[${new Date().toISOString()}] Firebase save completed in ${firebaseDuration}ms`);
        
        const totalDuration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] Total save-latex request completed in ${totalDuration}ms`);
        
        res.json({ 
            success: true, 
            message: 'LaTeX content saved successfully',
            timing: {
                total: totalDuration,
                firebaseSave: firebaseDuration
            }
        });
        
    } catch (error) {
        const totalDuration = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] Error saving LaTeX content after ${totalDuration}ms:`, error);
        res.status(500).json({ 
            error: 'Failed to save LaTeX content', 
            details: error.message,
            timing: `Failed after ${totalDuration}ms`
        });
    }
});

// Simple health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
});

module.exports = app;