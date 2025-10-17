# ===== server/package.json =====
{
  "name": "ai-admin-agent-pro-server",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "NODE_ENV=development node index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "openai": "^4.57.0"
  }
}

# ===== server/.env.example =====
# Copy to .env and fill in:
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
# Optional:
OPENAI_MODEL=gpt-4o-mini
PORT=8787

# ===== server/index.js =====
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { OpenAI } from 'openai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const classifyIntent = async (text) => {
  const sys = `
You convert any admin command into a strict JSON intent. Return ONLY JSON.

Schema:
{
  "action": "show_table" | "search" | "export" | "stats" | "summary" | "email_draft" | "help" | "unknown",
  "params": {
    "term": string?,
    "maxRows": number?,
    "to": string?,
    "subject": string?
  }
}

Examples:
"show sheet data" -> {"action":"show_table","params":{"maxRows":20}}
"find acme in sheet" -> {"action":"search","params":{"term":"acme"}}
"export data" -> {"action":"export","params":{}}
"how many records" -> {"action":"stats","params":{}}
"generate summary and insights" -> {"action":"summary","params":{}}
"create email to a@b.com subject Weekly Update" -> {"action":"email_draft","params":{"to":"a@b.com","subject":"Weekly Update"}}
"help" -> {"action":"help","params":{}}

If unclear -> {"action":"unknown","params":{}}
`;
  const res = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: text || '' }
    ],
    temperature: 0
  });
  try {
    return JSON.parse(res.choices[0].message.content);
  } catch {
    return { action: 'unknown', params: {} };
  }
};

const quoteCSV = (val = '') => {
  const s = String(val ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCSV = (rows) => {
  if (!rows?.length) return '';
  const headers = Object.keys(rows[0]);
  const head = headers.map(quoteCSV).join(',');
  const body = rows.map(r => headers.map(h => quoteCSV(r[h])).join(',')).join('\n');
  return `${head}\n${body}`;
};

const headersFrom = (data) =>
  data?.length ? Object.keys(data[0]).filter(k => k !== 'id') : [];

const tablePayload = (title, headers, rows, total, summary) => ({
  type: 'table',
  message: {
    title,
    tableData: { headers, rows, total },
    summary
  }
});

const textPayload = (text) => ({ type: 'text', message: text });

app.post('/api/ai', async (req, res) => {
  const { command, currentAdmin = 'Admin', sheetData = [] } = req.body || {};
  const intent = await classifyIntent(command || '');
  const hdrs = headersFrom(sheetData);

  try {
    switch (intent.action) {
      case 'show_table': {
        const maxRows = Math.max(1, Math.min(intent.params?.maxRows ?? 20, 200));
        const rows = sheetData.slice(0, maxRows);
        return res.json(
          tablePayload(
            '📊 Live Google Sheet Data',
            hdrs,
            rows,
            sheetData.length,
            `Loaded ${sheetData.length} total records.`
          )
        );
      }

      case 'search': {
        const term = (intent.params?.term || '').trim();
        if (!term) return res.json(textPayload('🔎 Please provide something to search for.'));
        const lc = term.toLowerCase();
        const results = sheetData.filter(r =>
          Object.values(r).some(v => String(v ?? '').toLowerCase().includes(lc))
        );
        if (!results.length) {
          return res.json(textPayload(`🔍 No results found for "${term}". Try another term.`));
        }
        const rows = results.slice(0, 100);
        return res.json(
          tablePayload(
            `🔍 Search Results for "${term}"`,
            hdrs,
            rows,
            results.length,
            `Found ${results.length} matching record(s).`
          )
        );
      }

      case 'export': {
        if (!sheetData.length) return res.json(textPayload('No data to export.'));
        const csv = toCSV(sheetData);
        return res.json({
          type: 'download',
          message: {
            content: csv,
            filename: `sheet-export-${Date.now()}.csv`,
            text: `✅ Ready to download! ${sheetData.length} records prepared as CSV file.`
          }
        });
      }

      case 'stats': {
        const cols = hdrs.length;
        const lines = [
          '📊 **Sheet Statistics**',
          '',
          `**Total Records:** ${sheetData.length}`,
          `**Columns:** ${cols} (${hdrs.join(', ')})`,
          `**Admin:** ${currentAdmin}`,
          `**Last Updated:** ${new Date().toLocaleString()}`
        ].join('\n');
        return res.json(textPayload(lines));
      }

      case 'summary': {
        const preview = sheetData.slice(0, 50);
        try {
          const sys = `Analyze tabular business data. Output: 3-5 bullet insights + 3 short recommendations. Be concise.`;
          const user = `Headers: ${hdrs.join(', ')}
Sample rows (JSON): ${JSON.stringify(preview)}
Total rows: ${sheetData.length}`;
          const ai = await openai.chat.completions.create({
            model: MODEL,
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: user }
            ],
            temperature: 0.3
          });
          const summary = `📝 **Executive Summary**\n\n${ai.choices[0].message.content}\n\n*Generated ${new Date().toLocaleString()} by ${currentAdmin}*`;
          return res.json(textPayload(summary));
        } catch (err) {
          return res.json(textPayload(`Summary unavailable: ${err.message}`));
        }
      }

      case 'email_draft': {
        const to = intent.params?.to?.trim() || 'recipient@example.com';
        const subject = intent.params?.subject?.trim() || 'Message from AI Agent';
        const preview = sheetData.slice(0, 10);
        try {
          const sys = `Write a brief, professional email body. Clear, actionable, no fluff.`;
          const user = `Recipient: ${to}
Subject: ${subject}
Context: Admin ${currentAdmin} with reference to data.
Headers: ${hdrs.join(', ')}
Sample rows: ${JSON.stringify(preview)}
Write only the body.`;
          const ai = await openai.chat.completions.create({
            model: MODEL,
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: user }
            ],
            temperature: 0.4
          });
          const body = `${ai.choices[0].message.content}\n\nBest regards,\n${currentAdmin}`;
          return res.json({
            type: 'email',
            message: {
              draft: {
                id: Date.now(),
                to,
                subject,
                body,
                createdBy: currentAdmin,
                timestamp: new Date().toLocaleString()
              }
            }
          });
        } catch (err) {
          return res.json(textPayload(`Email draft unavailable: ${err.message}`));
        }
      }

      case 'help': {
        const help = `🤖 **AI Agent Commands**

**📊 Data**
• "Show sheet data" — Table
• "Search acme" — Find rows
• "Count records" — Stats
• "Export data" — CSV

**📝 Analysis**
• "Generate summary" — Insights & recs

**📧 Email**
• "Create email to a@b.com subject Weekly Update" — Draft

**💬 Natural language**
Ask anything about the data; I'll route it.`;
        return res.json(textPayload(help));
      }

      default: {
        return res.json(
          textPayload(`I received: "${command}"\n\nTry:\n• "Show sheet data"\n• "Search {term}"\n• "Generate summary"\n• "Export data"\n• "Help"`)
        );
      }
    }
  } catch (e) {
    return res.status(500).json(textPayload(`Server error: ${e.message}`));
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`AI server listening on http://localhost:${PORT}`);
});

# ===== client/package.json =====
{
  "name": "ai-admin-agent-pro-client",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --port 5173"
  },
  "dependencies": {
    "lucide-react": "^0.469.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "vite": "^5.4.8"
  }
}

# ===== client/vite.config.js =====
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true
      }
    }
  }
});

# ===== client/tailwind.config.js =====
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: {} },
  plugins: []
};

# ===== client/postcss.config.js =====
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};

# ===== client/index.html =====
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Admin Agent Pro</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>

# ===== client/src/main.jsx =====
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(<App />);

# ===== client/src/index.css =====
@tailwind base;
@tailwind components;
@tailwind utilities;

# ===== client/src/App.jsx =====
import React, { useState, useRef, useEffect } from 'react';
import {
  Send, User, Bot, Mail, FileSpreadsheet, FileText, Zap,
  RefreshCw, Download, Search as SearchIcon, Copy, CheckCircle
} from 'lucide-react';

export default function App() {
  const [currentAdmin, setCurrentAdmin] = useState('Ryan');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetData, setSheetData] = useState([]);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef(null);

  const admins = ['Ryan', 'Tim', 'Jeevan', 'Vishwa', 'Jason', 'Myrna', 'Julie'];
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGqoyhQE2-8SK7aCLNtIdDXWsNwV-Cjvo6mLHeymu3RjC4CottLGZb6P9ivFVPdUDwyYcbULVms78s/pub?output=csv';

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  // Robust CSV parsing (why: commas/newlines/quotes in fields)
  const parseCSV = (csvText) => {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const c = csvText[i];
      const next = csvText[i + 1];

      if (inQuotes) {
        if (c === '"' && next === '"') { field += '"'; i++; continue; }
        if (c === '"') { inQuotes = false; continue; }
        field += c;
      } else {
        if (c === '"') { inQuotes = true; continue; }
        if (c === ',') { row.push(field); field = ''; continue; }
        if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
        if (c === '\r') { continue; }
        field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }

    if (!rows.length) return { headers: [], data: [] };
    const headers = rows[0].map(h => String(h || '').trim());
    const data = rows
      .slice(1)
      .filter(r => r.some(v => String(v ?? '').trim().length))
      .map((r, idx) => {
        const obj = { id: idx + 1 };
        headers.forEach((h, i) => { obj[h] = (r[i] ?? '').toString().trim(); });
        return obj;
      });
    return { headers, data };
  };

  const fetchSheetData = async () => {
    setIsLoadingSheet(true);
    try {
      const resp = await fetch(SHEET_URL);
      const csvText = await resp.text();
      const { data } = parseCSV(csvText);
      setSheetData(data);
      return { success: true, data };
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        type: 'bot',
        content: `Failed to load sheet: ${e.message}`,
        messageType: 'text',
        timestamp: new Date().toLocaleTimeString()
      }]);
      return { success: false, error: e.message };
    } finally {
      setIsLoadingSheet(false);
    }
  };

  useEffect(() => { fetchSheetData(); }, []);

  const formatAsTable = (data, maxRows = 20) => {
    if (!data || !data.length) return null;
    const headers = Object.keys(data[0]).filter(k => k !== 'id');
    const displayData = data.slice(0, maxRows);
    return { headers, rows: displayData, total: data.length };
  };

  const processCommand = async (command) => {
    const body = { command, currentAdmin, sheetData };
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const result = await resp.json();

    // Fallback: ensure table has structure if server omitted rows
    if (result?.type === 'table' && !result?.message?.tableData?.rows) {
      result.message = {
        title: result?.message?.title || 'Table',
        tableData: formatAsTable(sheetData),
        summary: result?.message?.summary || ''
      };
    }
    return result;
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      content: input,
      admin: currentAdmin,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      const response = await processCommand(userMessage.content);
      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: response.message,
        messageType: response.type,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now() + 2,
        type: 'bot',
        content: `Error: ${e.message}`,
        messageType: 'text',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCSV = (content, filename) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-t-2xl shadow-xl p-6 border-b-2 border-indigo-300">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-3 rounded-xl shadow-lg">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  AI Admin Agent Pro
                </h1>
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  🤖 AI via secure server • Connected to Google Sheets
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchSheetData}
                disabled={isLoadingSheet}
                className="px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 flex items-center gap-2 disabled:opacity-50 shadow-md transition-all"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                Sync
              </button>
              <select
                value={currentAdmin}
                onChange={(e) => setCurrentAdmin(e.target.value)}
                className="px-4 py-2 border-2 border-indigo-300 rounded-lg font-semibold text-indigo-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-md"
              >
                {admins.map(admin => (
                  <option key={admin} value={admin}>👤 {admin}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white px-6 py-4 border-b border-gray-200 shadow-md">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setInput('Show sheet data')} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> View Table
            </button>
            <button onClick={() => setInput('Search ')} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <SearchIcon className="w-4 h-4" /> Search
            </button>
            <button onClick={() => setInput('Create email to jeevansaigali@gmail.com subject Weekly Update')} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email
            </button>
            <button onClick={() => setInput('Generate summary and insights')} className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <FileText className="w-4 h-4" /> Analyze
            </button>
            <button onClick={() => setInput('Export data')} className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        <div className="bg-white shadow-xl h-[32rem] overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <Bot className="w-20 h-20 mx-auto mb-4 text-indigo-400" />
              <p className="text-2xl font-bold text-gray-700">Welcome, {currentAdmin}! 👋</p>
              <p className="text-sm mt-2 text-gray-600">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                {sheetData.length} records loaded • AI Ready
              </p>
              <p className="text-xs mt-4 text-gray-400">Try: "Show sheet data" or "Help"</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`mb-6 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-4xl w-full ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${msg.type === 'user' ? 'bg-gradient-to-br from-indigo-600 to-purple-600' : 'bg-gradient-to-br from-gray-300 to-gray-400'}`}>
                  {msg.type === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-gray-700" />}
                </div>
                <div className={`rounded-2xl p-5 shadow-lg flex-1 ${msg.type === 'user' ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white' : 'bg-gray-50 text-gray-800 border border-gray-200'}`}>
                  {msg.type === 'user' && (
                    <div className="text-xs opacity-90 mb-2 font-semibold">{msg.admin}</div>
                  )}

                  {msg.messageType === 'table' && msg.content.tableData ? (
                    <div>
                      <h3 className="font-bold text-lg mb-3">{msg.content.title}</h3>
                      <div className="overflow-x-auto bg-white rounded-lg shadow-inner p-4">
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                              <th className="border border-gray-300 px-4 py-2 text-left text-white font-semibold">#</th>
                              {msg.content.tableData.headers.map((header, idx) => (
                                <th key={idx} className="border border-gray-300 px-4 py-2 text-left text-white font-semibold">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.content.tableData.rows.map((row, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                                <td className="border border-gray-300 px-4 py-2 font-semibold text-gray-600">{idx + 1}</td>
                                {msg.content.tableData.headers.map((header, hIdx) => (
                                  <td key={hIdx} className="border border-gray-300 px-4 py-2 text-gray-700">
                                    {row[header]}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-sm mt-3 text-gray-600 italic">{msg.content.summary}</p>
                      {msg.content.tableData.total > msg.content.tableData.rows.length && (
                        <p className="text-xs mt-2 text-gray-500">
                          Showing {msg.content.tableData.rows.length} of {msg.content.tableData.total} records
                        </p>
                      )}
                    </div>
                  ) : msg.messageType === 'email' ? (
                    <div className="bg-white text-gray-800 rounded-lg p-4 border-2 border-green-500">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-lg text-green-600 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Email Draft Created
                        </h3>
                        <button
                          onClick={() => copyToClipboard(msg.content.draft.body)}
                          className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><strong>To:</strong> {msg.content.draft.to}</p>
                        <p><strong>Subject:</strong> {msg.content.draft.subject}</p>
                        <p><strong>From:</strong> {msg.content.draft.createdBy}</p>
                        <div className="mt-3 p-3 bg-gray-50 rounded border">
                          <p className="text-xs text-gray-600 mb-2">Body Preview:</p>
                          <pre className="whitespace-pre-wrap text-xs">{msg.content.draft.body}</pre>
                        </div>
                      </div>
                    </div>
                  ) : msg.messageType === 'download' ? (
                    <div>
                      <p className="mb-3">{msg.content.text}</p>
                      <button
                        onClick={() => downloadCSV(msg.content.content, msg.content.filename)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Download CSV
                      </button>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  )}

                  <div className="text-xs opacity-70 mt-3 pt-2 border-t border-opacity-20">
                    {msg.timestamp}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-lg">
                <Bot className="w-5 h-5 text-gray-700" />
              </div>
              <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 shadow-lg">
                <div className="flex gap-1">
                  <div className="w-3 h-3 rounded-full animate-bounce bg-indigo-500"></div>
                  <div className="w-3 h-3 rounded-full animate-bounce" style={{ background: '#a855f7', animationDelay: '0.1s' }}></div>
                  <div className="w-3 h-3 rounded-full animate-bounce" style={{ background: '#ec4899', animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="bg-white rounded-b-2xl shadow-xl p-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything naturally…"
              className="flex-1 px-5 py-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg shadow-inner"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all transform hover:scale-105"
            >
              <Send className="w-5 h-5" />
              Send
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl p-5 shadow-lg text-white">
            <FileSpreadsheet className="w-8 h-8 mb-2 opacity-90" />
            <div className="text-3xl font-bold">{sheetData.length}</div>
            <div className="text-sm opacity-90">Sheet Records</div>
          </div>
          <div className="bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl p-5 shadow-lg text-white">
            <Mail className="w-8 h-8 mb-2 opacity-90" />
            <div className="text-3xl font-bold">{messages.filter(m => m.messageType === 'email').length}</div>
            <div className="text-sm opacity-90">Email Drafts</div>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl p-5 shadow-lg text-white">
            <Zap className="w-8 h-8 mb-2 opacity-90" />
            <div className="text-3xl font-bold">{messages.length}</div>
            <div className="text-sm opacity-90">Total Commands</div>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-5 shadow-lg text-white">
            <Bot className="w-8 h-8 mb-2 opacity-90" />
            <div className="text-3xl font-bold">AI+</div>
            <div className="text-sm opacity-90">Server Secured</div>
          </div>
        </div>
      </div>
    </div>
  );
}

# ===== README.md =====
# AI Admin Agent Pro

## Run
1) Server
   - cd server
   - cp .env.example .env  # add OPENAI_API_KEY
   - npm i
   - npm run dev

2) Client
   - cd client
   - npm i
   - npm run dev
   - Open http://localhost:5173

