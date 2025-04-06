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

// API endpoint to convert MD to LaTeX
app.post('/api/convert-to-latex', async (req, res) => {
    try {
        const { fileId } = req.body;
        
        if (!fileId) {
            return res.status(400).json({ error: 'File ID is required' });
        }
        
        // Get the markdown content from Firebase
        const snapshot = await database.ref(`mdfiles/${fileId}/content`).once('value');
        const content = snapshot.val();
        
        if (!content) {
            return res.status(404).json({ error: 'Markdown content not found' });
        }
        
        // Convert markdown to LaTeX using Gemini
        const latexContent = await convertToLatex(content);
        
        // Return the LaTeX content
        res.json({ 
            original: content,
            latex: latexContent 
        });
        
    } catch (error) {
        console.error('Error converting to LaTeX:', error);
        res.status(500).json({ error: 'Failed to convert to LaTeX', details: error.message });
    }
});

// Function to convert markdown to LaTeX using Gemini
async function convertToLatex(markdownContent) {
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
        
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // Extract the LaTeX content from Gemini's response
        const latexContent = response.data.candidates[0].content.parts[0].text;
        return latexContent;
        
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        throw new Error(`Failed to convert markdown to LaTeX: ${error.message}`);
    }
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Additional utility to save the converted LaTeX content back to Firebase
app.post('/api/save-latex', async (req, res) => {
    try {
        const { fileId, latexContent } = req.body;
        
        if (!fileId || !latexContent) {
            return res.status(400).json({ error: 'File ID and LaTeX content are required' });
        }
        
        // Save the LaTeX content to Firebase
        await database.ref(`latexfiles/${fileId}/content`).set(latexContent);
        await database.ref(`latexfiles/${fileId}/timestamp`).set(admin.database.ServerValue.TIMESTAMP);
        
        res.json({ success: true, message: 'LaTeX content saved successfully' });
        
    } catch (error) {
        console.error('Error saving LaTeX content:', error);
        res.status(500).json({ error: 'Failed to save LaTeX content', details: error.message });
    }
});

module.exports = app;
