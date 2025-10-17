import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Mail, FileSpreadsheet, Database, FileText, Zap, RefreshCw, Download, Search, Copy, CheckCircle } from 'lucide-react';

export default function AIAgentSystem() {
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
  
  // OpenAI API Key - AI ENABLED
  const OPENAI_API_KEY = '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';
  const USE_AI = true;

  const [emailDrafts, setEmailDrafts] = useState([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch real Google Sheet data
  const fetchSheetData = async () => {
    setIsLoadingSheet(true);
    try {
      const response = await fetch(SHEET_URL);
      const csvText = await response.text();
      
      const rows = csvText.split('\n').filter(row => row.trim());
      const headers = rows[0].split(',').map(h => h.trim());
      
      const data = rows.slice(1).map((row, idx) => {
        const values = row.split(',');
        const obj = { id: idx + 1 };
        headers.forEach((header, i) => {
          obj[header] = values[i]?.trim() || '';
        });
        return obj;
      });
      
      setSheetData(data);
      setIsLoadingSheet(false);
      return { success: true, data, headers };
    } catch (error) {
      setIsLoadingSheet(false);
      return { success: false, error: error.message };
    }
  };

  useEffect(() => {
    fetchSheetData();
  }, []);

  // Format data as HTML table
  const formatAsTable = (data, maxRows = 20) => {
    if (!data || data.length === 0) return null;
    
    const headers = Object.keys(data[0]).filter(k => k !== 'id');
    const displayData = data.slice(0, maxRows);
    
    return { headers, rows: displayData, total: data.length };
  };

  // Call OpenAI API
  const callOpenAI = async (userMessage, context = '') => {
    if (!USE_AI) return null;
    
    try {
      const systemPrompt = `You are an intelligent AI assistant for a multi-admin management system. You help with:
- Google Sheets data analysis and management
- Email drafting and communication
- Data searching and filtering  
- Report generation
- General questions and tasks

Current context: ${context}
Current admin: ${currentAdmin}
Available sheet data: ${sheetData.length} records

Respond naturally and helpfully. Be concise but thorough.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 1000
        })
      });

      const data = await response.json();
      return data.choices[0]?.message?.content;
    } catch (error) {
      console.error('OpenAI Error:', error);
      return null;
    }
  };

  // Enhanced command processing
  const processCommand = async (command) => {
    const lowerCommand = command.toLowerCase();

    // Email Creation
    if (lowerCommand.includes('create email') || lowerCommand.includes('draft email') || lowerCommand.includes('compose email') || lowerCommand.includes('write email')) {
      const to = lowerCommand.match(/to ([a-z0-9@.\s]+)/i)?.[1] || 'recipient@example.com';
      const subjectMatch = lowerCommand.match(/subject ([^,.\n]+)/i);
      let subject = subjectMatch?.[1]?.trim() || 'Message from AI Agent';
      
      let body = `Hello,\n\n`;
      
      if (USE_AI) {
        const aiBody = await callOpenAI(`Write a professional email body for: ${command}. Keep it concise and professional.`);
        body += aiBody || 'This email was created by the AI Agent.';
      } else {
        body += `This email was created by ${currentAdmin} using the AI Agent.\n\n`;
        
        if (lowerCommand.includes('sheet') || lowerCommand.includes('data') || lowerCommand.includes('report')) {
          body += `**Latest Data Summary:**\n\n`;
          sheetData.slice(0, 5).forEach((row, idx) => {
            const entries = Object.entries(row).filter(([key]) => key !== 'id');
            body += `${idx + 1}. ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
          });
        }
      }
      
      body += `\n\nBest regards,\n${currentAdmin}`;
      
      const draft = {
        id: Date.now(),
        to: to.trim(),
        subject: subject,
        body: body,
        createdBy: currentAdmin,
        timestamp: new Date().toLocaleString()
      };
      
      setEmailDrafts(prev => [...prev, draft]);
      
      return {
        type: 'email',
        message: { draft }
      };
    }

    // Fetch Sheet Data - Returns table format
    if (lowerCommand.includes('fetch') || lowerCommand.includes('show') || lowerCommand.includes('display') || lowerCommand.includes('get')) {
      if (lowerCommand.includes('sheet') || lowerCommand.includes('data') || lowerCommand.includes('table') || lowerCommand.includes('records')) {
        const result = await fetchSheetData();
        
        if (result.success) {
          const tableData = formatAsTable(result.data);
          return {
            type: 'table',
            message: {
              title: '📊 Live Google Sheet Data',
              tableData: tableData,
              summary: `Successfully loaded ${result.data.length} records from your Google Sheet.`
            }
          };
        }
      }
    }

    // Search functionality
    if (lowerCommand.includes('search') || lowerCommand.includes('find') || lowerCommand.includes('look for')) {
      const searchTerm = lowerCommand.replace(/search|find|look for|in|sheet|data/gi, '').trim();
      
      if (sheetData.length === 0) await fetchSheetData();
      
      const results = sheetData.filter(row => {
        return Object.values(row).some(val => 
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
      
      if (results.length > 0) {
        const tableData = formatAsTable(results, 10);
        return {
          type: 'table',
          message: {
            title: `🔍 Search Results for "${searchTerm}"`,
            tableData: tableData,
            summary: `Found ${results.length} matching record(s)`
          }
        };
      } else {
        return {
          type: 'text',
          message: `🔍 No results found for "${searchTerm}" in the sheet data. Try a different search term.`
        };
      }
    }

    // Export data
    if (lowerCommand.includes('export') || lowerCommand.includes('download')) {
      const csv = [
        Object.keys(sheetData[0] || {}).join(','),
        ...sheetData.map(row => Object.values(row).join(','))
      ].join('\n');
      
      return {
        type: 'download',
        message: {
          content: csv,
          filename: `sheet-export-${Date.now()}.csv`,
          text: `✅ Ready to download! ${sheetData.length} records prepared as CSV file.`
        }
      };
    }

    // Statistics
    if (lowerCommand.includes('count') || lowerCommand.includes('how many') || lowerCommand.includes('total') || lowerCommand.includes('stats')) {
      const headers = sheetData.length > 0 ? Object.keys(sheetData[0]).filter(k => k !== 'id') : [];
      
      return {
        type: 'text',
        message: `📊 **Sheet Statistics**\n\n**Total Records:** ${sheetData.length}\n**Columns:** ${headers.length} (${headers.join(', ')})\n**Last Updated:** ${new Date().toLocaleString()}\n**Admin:** ${currentAdmin}\n\nUse "show sheet data" to view all records in table format.`
      };
    }

    // Summary/Report
    if (lowerCommand.includes('summary') || lowerCommand.includes('report') || lowerCommand.includes('analyze')) {
      let summary = `📝 **Executive Summary**\n\n`;
      
      if (USE_AI && sheetData.length > 0) {
        const dataContext = JSON.stringify(sheetData.slice(0, 10));
        const aiSummary = await callOpenAI(`Analyze this data and provide insights: ${dataContext}. Give key findings and recommendations.`);
        summary += aiSummary || 'Analysis in progress...';
      } else {
        summary += `**Data Overview:**\n`;
        summary += `• Total Records: ${sheetData.length}\n`;
        summary += `• Email Drafts: ${emailDrafts.length}\n`;
        summary += `• Current Admin: ${currentAdmin}\n`;
        summary += `• System Status: ✅ Operational\n\n`;
        summary += `**Recommendations:**\n`;
        summary += `✓ Review latest entries\n`;
        summary += `✓ Follow up on pending items\n`;
        summary += `✓ Monitor data quality\n`;
      }
      
      summary += `\n\n*Generated ${new Date().toLocaleString()} by ${currentAdmin}*`;
      
      return { type: 'text', message: summary };
    }

    // Use AI for everything else if available
    if (USE_AI) {
      const context = `Sheet has ${sheetData.length} records. Email drafts: ${emailDrafts.length}.`;
      const aiResponse = await callOpenAI(command, context);
      
      if (aiResponse) {
        return { type: 'text', message: aiResponse };
      }
    }

    // Help
    if (lowerCommand.includes('help') || lowerCommand.includes('what can you')) {
      return {
        type: 'text',
        message: `🤖 **AI Agent Commands**\n\n**📊 Data Operations:**\n• "Show sheet data" - View in table format\n• "Search [term]" - Find records\n• "Count records" - Statistics\n• "Export data" - Download CSV\n\n**📧 Email:**\n• "Create email to [email]" - Draft email\n• "Email report to [email]" - Send data report\n\n**📝 Analysis:**\n• "Generate summary" - Data insights\n• "Analyze data" - AI analysis\n\n**💬 Ask Anything:**\n${USE_AI ? 'AI is enabled - ask me anything naturally!' : 'Add OpenAI API key for natural language!'}\n\n*Type naturally - I understand context!*`
      };
    }

    // Default: try to be helpful
    return {
      type: 'text',
      message: `I received: "${command}"\n\n💡 **Try:**\n• "Show sheet data" - View table\n• "Search [term]" - Find data\n• "Create email to john@example.com" - Draft email\n• "Help" - See all commands\n\n${USE_AI ? '' : '💎 **Tip:** Add your OpenAI API key for smarter responses!'}`
    };
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

    setTimeout(async () => {
      const response = await processCommand(input);
      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: response.message,
        messageType: response.type,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, botMessage]);
      setIsProcessing(false);
    }, 800);
  };

  const handleKeyPress = (e) => {
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
                  {USE_AI ? '🤖 AI Enabled' : '⚡ Basic Mode'} • Connected to Google Sheets
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
            <button onClick={() => setInput('Show sheet data in table')} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> View Table
            </button>
            <button onClick={() => setInput('Search ')} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Search className="w-4 h-4" /> Search
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
                {sheetData.length} records loaded • {USE_AI ? 'AI Ready' : 'Add API key for AI'}
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
                      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                        {msg.content.title}
                      </h3>
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
                  <div className="w-3 h-3 bg-indigo-500 rounded-full animate-bounce"></div>
                  <div className="w-3 h-3 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-3 h-3 bg-pink-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
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
              onKeyPress={handleKeyPress}
              placeholder={USE_AI ? "Ask me anything naturally..." : "Type command: 'Show table', 'Search', 'Create email'..."}
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
            <div className="text-3xl font-bold">{emailDrafts.length}</div>
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
            <div className="text-sm opacity-90">GPT-4 Enabled</div>
          </div>
        </div>
      </div>
    </div>
  );
}
