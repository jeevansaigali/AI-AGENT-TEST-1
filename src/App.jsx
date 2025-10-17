// client/src/App.jsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Send, User, Bot, Mail, FileSpreadsheet, FileText, Zap,
  RefreshCw, Download, Search as SearchIcon, Copy, CheckCircle
} from 'lucide-react';

export default function App() {
  // State
  const [currentAdmin, setCurrentAdmin] = useState('Ryan');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetData, setSheetData] = useState([]);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [copied, setCopied] = useState(false);
  const [gmailStatus, setGmailStatus] = useState({ connected: false, email: '' });
  const [sendingId, setSendingId] = useState(null); // why: per-draft sending spinner
  const messagesEndRef = useRef(null);

  // Config
  const admins = ['Ryan', 'Tim', 'Jeevan', 'Vishwa', 'Jason', 'Myrna', 'Julie'];
  const SHEET_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGqoyhQE2-8SK7aCLNtIdDXWsNwV-Cjvo6mLHeymu3RjC4CottLGZb6P9ivFVPdUDwyYcbULVms78s/pub?output=csv';

  // Auto-scroll
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  // Robust CSV parser (handles quotes/commas/newlines)
  const parseCSV = (csvText) => {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < csvText.length; i++) {
      const c = csvText[i], next = csvText[i + 1];
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

  // Data loaders
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

  const fetchGmailStatus = async () => {
    try {
      const r = await fetch('/api/email/status');
      const j = await r.json();
      setGmailStatus(j);
    } catch {
      setGmailStatus({ connected: false, email: '' });
    }
  };

  useEffect(() => { fetchSheetData(); fetchGmailStatus(); }, []);

  // Helpers
  const formatAsTable = (data, maxRows = 20) => {
    if (!data || !data.length) return null;
    const headers = Object.keys(data[0]).filter(k => k !== 'id');
    const displayData = data.slice(0, maxRows);
    return { headers, rows: displayData, total: data.length };
  };

  const processCommand = async (command) => {
    // why: server routes natural language → intent, safer + accurate
    const resp = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, currentAdmin, sheetData })
    });
    const result = await resp.json();
    if (result?.type === 'table' && !result?.message?.tableData?.rows) {
      result.message = {
        title: result?.message?.title || 'Table',
        tableData: formatAsTable(sheetData),
        summary: result?.message?.summary || ''
      };
    }
    return result;
  };

  // Actions
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
      if (response.type === 'text' && String(response.message || '').includes('Gmail id:')) {
        fetchGmailStatus();
      }
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
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
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const connectGmail = () => { window.location.href = '/auth/google'; };

  const sendViaGmail = async (draft) => {
    try {
      setSendingId(draft.id);
      const resp = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: draft.to,
          subject: draft.subject,
          body: draft.body,
          cc: draft.cc,
          bcc: draft.bcc
        })
      });
      const j = await resp.json();
      if (j.ok) {
        setMessages(prev => [...prev, {
          id: Date.now() + 3,
          type: 'bot',
          content: `📧 Sent! Gmail id: ${j.id}`,
          messageType: 'text',
          timestamp: new Date().toLocaleTimeString()
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now() + 4,
          type: 'bot',
          content: `Send failed: ${j.error || 'unknown error'}`,
          messageType: 'text',
          timestamp: new Date().toLocaleTimeString()
        }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now() + 5,
        type: 'bot',
        content: `Send error: ${e.message}`,
        messageType: 'text',
        timestamp: new Date().toLocaleTimeString()
      }]);
    } finally {
      setSendingId(null);
    }
  };

  // UI
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
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
                  🤖 AI via secure server • {gmailStatus.connected ? `Gmail: ${gmailStatus.email}` : 'Gmail not connected'}
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
              {!gmailStatus.connected ? (
                <button
                  onClick={connectGmail}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 shadow-md"
                >
                  Connect Gmail
                </button>
              ) : (
                <span className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-lg font-semibold shadow-inner">
                  Gmail Connected
                </span>
              )}
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

        {/* Quick actions */}
        <div className="bg-white px-6 py-4 border-b border-gray-200 shadow-md">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setInput('Show sheet data')} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> View Table
            </button>
            <button onClick={() => setInput('Search ')} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <SearchIcon className="w-4 h-4" /> Search
            </button>
            <button onClick={() => setInput('Create email to someone@example.com subject Weekly Update')} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email
            </button>
            <button onClick={() => setInput('Email someone@example.com subject Weekly Update and send')} className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Mail className="w-4 h-4" /> Email & Send
            </button>
            <button onClick={() => setInput('Generate summary and insights')} className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <FileText className="w-4 h-4" /> Analyze
            </button>
            <button onClick={() => setInput('Export data')} className="px-4 py-2 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="bg-white shadow-xl h-[32rem] overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <Bot className="w-20 h-20 mx-auto mb-4 text-indigo-400" />
              <p className="text-2xl font-bold text-gray-700">Welcome, {currentAdmin}! 👋</p>
              <p className="text-sm mt-2 text-gray-600">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                {sheetData.length} records loaded • AI Ready
              </p>
              <p className="text-xs mt-4 text-gray-400">Try: "Show sheet data" or "Email someone@example.com subject X and send"</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`mb-6 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-4xl w-full ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center shadow-lg ${msg.type === 'user' ? 'bg-gradient-to-br from-indigo-600 to-purple-600' : 'bg-gradient-to-br from-gray-300 to-gray-400'}`}>
                  {msg.type === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-gray-700" />}
                </div>
                <div className={`rounded-2xl p-5 shadow-lg flex-1 ${msg.type === 'user' ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white' : 'bg-gray-50 text-gray-800 border border-gray-200'}`}>
                  {msg.type === 'user' && (<div className="text-xs opacity-90 mb-2 font-semibold">{msg.admin}</div>)}

                  {/* Table */}
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
                    // Email draft card
                    <div className="bg-white text-gray-800 rounded-lg p-4 border-2 border-green-500">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-lg text-green-600 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Email Draft Created
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => copyToClipboard(msg.content.draft.body)}
                            className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                          {gmailStatus.connected ? (
                            <button
                              onClick={() => sendViaGmail(msg.content.draft)}
                              disabled={sendingId === msg.content.draft.id}
                              className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                            >
                              {sendingId === msg.content.draft.id ? 'Sending…' : 'Send via Gmail'}
                            </button>
                          ) : (
                            <button onClick={connectGmail} className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">
                              Connect Gmail
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><strong>To:</strong> {msg.content.draft.to}</p>
                        <p><strong>Subject:</strong> {msg.content.draft.subject}</p>
                        {msg.content.draft.cc ? <p><strong>CC:</strong> {msg.content.draft.cc}</p> : null}
                        {msg.content.draft.bcc ? <p><strong>BCC:</strong> {msg.content.draft.bcc}</p> : null}
                        <p><strong>From:</strong> {gmailStatus.connected ? gmailStatus.email : 'Not connected'}</p>
                        <div className="mt-3 p-3 bg-gray-50 rounded border">
                          <p className="text-xs text-gray-600 mb-2">Body Preview:</p>
                          <pre className="whitespace-pre-wrap text-xs">{msg.content.draft.body}</pre>
                        </div>
                      </div>
                    </div>
                  ) : msg.messageType === 'download' ? (
                    // Download card
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
                    // Plain text
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

          {/* Typing indicator */}
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

        {/* Composer */}
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

        {/* Stats */}
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
            <div className="text-3xl font-bold">{gmailStatus.connected ? 'Gmail ✓' : 'Gmail ×'}</div>
            <div className="text-sm opacity-90">Mail Status</div>
          </div>
        </div>
      </div>
    </div>
  );
}
