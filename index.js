const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const marked = require('marked');

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Local storage setup for caching
const cacheDir = path.join(__dirname, 'conversion-cache');

// Create the cache directory if it doesn't exist
async function ensureCacheDirectoryExists() {
  try {
    await fs.mkdir(cacheDir, { recursive: true });
    console.log(`[${new Date().toISOString()}] Cache directory created or verified`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to create cache directory:`, err);
  }
}

// Configure custom Markdown to LaTeX renderer
const latexRenderer = {
  // Header rendering
  heading(text, level) {
    const headerCommands = [
      '\\section{', 
      '\\subsection{', 
      '\\subsubsection{', 
      '\\paragraph{', 
      '\\subparagraph{', 
      '\\subparagraph{'
    ];
    return `${headerCommands[level-1]}${text}}\n\n`;
  },
  
  // Paragraph rendering
  paragraph(text) {
    return `${text}\n\n`;
  },
  
  // List rendering
  list(body, ordered) {
    const listEnvironment = ordered ? 'enumerate' : 'itemize';
    return `\\begin{${listEnvironment}}\n${body}\\end{${listEnvironment}}\n\n`;
  },
  
  // List item rendering
  listitem(text) {
    return `\\item ${text}\n`;
  },
  
  // Code block rendering
  code(code, language) {
    if (language && language !== 'text') {
      return `\\begin{lstlisting}[language=${language}]\n${code}\n\\end{lstlisting}\n\n`;
    }
    return `\\begin{verbatim}\n${code}\n\\end{verbatim}\n\n`;
  },
  
  // Inline code rendering
  codespan(code) {
    return `\\texttt{${escapeLatexSpecialChars(code)}}`;
  },
  
  // Bold text
  strong(text) {
    return `\\textbf{${text}}`;
  },
  
  // Italic text
  em(text) {
    return `\\textit{${text}}`;
  },
  
  // Links
  link(href, title, text) {
    return `\\href{${href}}{${text}}`;
  },
  
  // Images
  image(href, title, text) {
    return `\\begin{figure}[h]
\\centering
\\includegraphics[width=0.8\\textwidth]{${href}}
\\caption{${text || title || ''}}
\\end{figure}`;
  },
  
  // Blockquote
  blockquote(quote) {
    return `\\begin{quotation}\n${quote}\\end{quotation}\n\n`;
  },
  
  // Tables
  table(header, body) {
    const columns = header.trim().split('&').length;
    return `\\begin{tabular}{${'|c'.repeat(columns)}|}
\\hline
${header}\\hline
${body}\\hline
\\end{tabular}\n\n`;
  },
  
  // Table row
  tablerow(content) {
    return `${content.trim()} \\\\ \\hline\n`;
  },
  
  // Table cell
  tablecell(content, flags) {
    return `${content} & `;
  },
  
  // Horizontal Rule
  hr() {
    return '\\hrulefill\n\n';
  }
};

// Helper function to escape LaTeX special characters
function escapeLatexSpecialChars(text) {
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}

// Process math expressions separately
function processMathExpressions(text) {
  // Replace inline math expressions (between $ signs)
  text = text.replace(/\$([^$]+)\$/g, (match, expr) => {
    try {
      return `$${expr}$`;
    } catch (e) {
      return match; // Return original if parsing fails
    }
  });
  
  // Replace block math expressions (between $$ signs)
  text = text.replace(/\$\$([^$]+)\$\$/g, (match, expr) => {
    try {
      return `\\begin{equation}${expr}\\end{equation}`;
    } catch (e) {
      return match; // Return original if parsing fails
    }
  });
  
  return text;
}

// Function to convert markdown to LaTeX with chunks processing for large documents
function convertMarkdownToLatex(markdownContent) {
  console.log(`[${new Date().toISOString()}] Starting conversion of ${markdownContent.length} characters`);
  
  try {
    // Set the custom renderer
    marked.use({ renderer: latexRenderer });
    
    // If the content is very large, process it in chunks
    if (markdownContent.length > 30000) {
      console.log(`[${new Date().toISOString()}] Large document detected, processing in chunks`);
      return processLargeDocument(markdownContent);
    }
    
    // Pre-process math expressions
    const processedMarkdown = processMathExpressions(markdownContent);
    
    // Convert to LaTeX
    let latexOutput = marked.parse(processedMarkdown);
    
    // Add LaTeX document structure
    latexOutput = wrapWithLatexStructure(latexOutput);
    
    console.log(`[${new Date().toISOString()}] Conversion completed, generated ${latexOutput.length} characters`);
    return latexOutput;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error converting markdown to LaTeX:`, error);
    throw new Error(`Failed to convert markdown to LaTeX: ${error.message}`);
  }
}

// Process large documents in chunks
function processLargeDocument(markdownContent) {
  // Split by major sections (headers)
  const sections = markdownContent.split(/(?=^#{1,6}\s)/m);
  console.log(`[${new Date().toISOString()}] Document split into ${sections.length} sections`);
  
  let latexContent = '';
  
  // Process each section
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    console.log(`[${new Date().toISOString()}] Processing section ${i+1}/${sections.length}`);
    
    // Pre-process math expressions
    const processedSection = processMathExpressions(section);
    
    // Convert to LaTeX
    const latexSection = marked.parse(processedSection);
    latexContent += latexSection;
  }
  
  // Add LaTeX document structure
  latexContent = wrapWithLatexStructure(latexContent);
  
  console.log(`[${new Date().toISOString()}] Large document processing completed`);
  return latexContent;
}

// Add full LaTeX document structure
function wrapWithLatexStructure(content) {
  return `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{listings}
\\usepackage{color}
\\usepackage{array}
\\usepackage{booktabs}
\\usepackage{longtable}
\\usepackage{tabularx}

\\title{Converted Document}
\\author{}
\\date{\\today}

\\begin{document}

\\maketitle

${content}

\\end{document}`;
}

// Generate a cache key from content
function generateCacheKey(content) {
  // Simple hash function for content
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `md-${Math.abs(hash).toString(16)}`;
}

// Check cache for existing conversion
async function getFromCache(cacheKey) {
  try {
    const filePath = path.join(cacheDir, `${cacheKey}.json`);
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(`[${new Date().toISOString()}] Error reading from cache:`, err);
    }
    return null;
  }
}

// Save result to cache
async function saveToCache(cacheKey, content) {
  try {
    const filePath = path.join(cacheDir, `${cacheKey}.json`);
    await fs.writeFile(filePath, JSON.stringify({
      content,
      timestamp: Date.now()
    }, null, 2));
    console.log(`[${new Date().toISOString()}] Conversion result cached: ${cacheKey}`);
    return true;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to cache result:`, err);
    return false;
  }
}

// API endpoint to convert MD to LaTeX
app.post('/api/convert-to-latex', async (req, res) => {
  const totalStartTime = Date.now();
  console.log(`[${new Date().toISOString()}] Starting conversion request`);
  
  try {
    const { content } = req.body;
    
    if (!content) {
      console.log(`[${new Date().toISOString()}] Missing markdown content`);
      return res.status(400).json({ error: 'Markdown content is required' });
    }
    
    // Generate cache key
    const cacheKey = generateCacheKey(content);
    
    // Check if we have this conversion cached
    const cachedResult = await getFromCache(cacheKey);
    if (cachedResult) {
      console.log(`[${new Date().toISOString()}] Returning cached conversion result`);
      const totalDuration = Date.now() - totalStartTime;
      return res.json({
        latex: cachedResult.content,
        timings: {
          total: totalDuration,
          cache: true
        }
      });
    }
    
    console.log(`[${new Date().toISOString()}] Starting markdown to LaTeX conversion`);
    const conversionStartTime = Date.now();
    
    // Convert markdown to LaTeX
    const latexContent = convertMarkdownToLatex(content);
    
    const conversionDuration = Date.now() - conversionStartTime;
    console.log(`[${new Date().toISOString()}] Conversion completed in ${conversionDuration}ms`);
    
    // Save to cache for future requests
    await saveToCache(cacheKey, latexContent);
    
    // Return the LaTeX content
    const totalDuration = Date.now() - totalStartTime;
    console.log(`[${new Date().toISOString()}] Total request completed in ${totalDuration}ms`);
    
    res.json({ 
      latex: latexContent,
      timings: {
        total: totalDuration,
        conversion: conversionDuration
      }
    });
    
  } catch (error) {
    const totalDuration = Date.now() - totalStartTime;
    console.error(`[${new Date().toISOString()}] Error converting to LaTeX:`, error);
    res.status(500).json({ 
      error: 'Failed to convert to LaTeX', 
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

// Initialize on startup
async function startup() {
  console.log(`[${new Date().toISOString()}] Starting server initialization`);
  
  // Create cache directory
  await ensureCacheDirectoryExists();
  
  // Start the server
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
    console.log(`[${new Date().toISOString()}] Ready to convert markdown to LaTeX`);
  });
}

// Start the server
startup().catch(error => {
  console.error(`[${new Date().toISOString()}] Startup error:`, error);
  process.exit(1);
});

module.exports = app;