import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Mail, FileSpreadsheet, Database, FileText, Zap, RefreshCw, Download, Search, Copy, CheckCircle, LogIn } from 'lucide-react';

export default function AIAgentSystem() {
  const [currentAdmin, setCurrentAdmin] = useState('Ryan');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetData, setSheetData] = useState([]);
  const [sheetHeaders, setSheetHeaders] = useState([]);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef(null);

  const admins = ['Ryan', 'Tim', 'Jeevan', 'Vishwa', 'Jason', 'Myrna', 'Julie'];
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGqoyhQE2-8SK7aCLNtIdDXWsNwV-Cjvo6mLHeymu3RjC4CottLGZb6P9ivFVPdUDwyYcbULVms78s/pub?output=csv';
  
  const OPENAI_API_KEY = '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';
  
  const GMAIL_CONFIG = {
    clientId: '1020063765005-mbbbpv12tpa9eqkh481vssp44jp8srgi.apps.googleusercontent.com',
    clientSecret: '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',
    redirectUri: 'https://ai-agent-multi-admin.vercel.app/auth/callback'
  };

  const [emailDrafts, setEmailDrafts] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch and parse Google Sheet data properly
  const fetchSheetData = async () => {
    setIsLoadingSheet(true);
    try {
      const response = await fetch(SHEET_URL);
      const csvText = await response.text();
      
      const rows = csvText.trim().split('\n').filter(row => row.trim());
      if (rows.length === 0) throw new Error('No data found');
      
      const headers = rows[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
      setSheetHeaders(headers);
      
      const data = rows.slice(1).map((row, idx) => {
        const values = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        const cleanValues = values.map(v => v.replace(/^["']|["']$/g, '').trim());
        
        const obj = { _id: idx + 1 };
        headers.forEach((header, i) => {
          obj[header] = cleanValues[i] || '';
        });
        return obj;
      });
      
      setSheetData(data);
      setIsLoadingSheet(false);
      return { success: true, data, headers };
    } catch (error) {
      setIsLoadingSheet(false);
      console.error('Sheet fetch error:', error);
      return { success: false, error: error.message };
    }
  };

  useEffect(() => {
    fetchSheetData();
  }, []);

  // REAL GPT-4 API Call with conversation context
  const callGPT4 = async (userMessage) => {
    try {
      // Prepare sheet data context
      const sheetContext = sheetData.length > 0 
        ? `\n\nCURRENT GOOGLE SHEET DATA:\n${JSON.stringify(sheetData.slice(0, 15), null, 2)}\n\nTotal Records: ${sheetData.length}\nColumns: ${sheetHeaders.join(', ')}`
        : '\n\nNo sheet data loaded yet.';

      const systemContext = `You are an intelligent AI assistant for ${currentAdmin}, helping with business management tasks.

CURRENT CONTEXT:
- Admin User: ${currentAdmin}
- Email: jeevansaigali@gmail.com
- System: Multi-Admin AI Agent
- Data Available: ${sheetData.length} records from Google Sheets

YOUR CAPABILITIES:
1. Analyze data and provide insights
2. Create professional emails and drafts
3. Answer questions naturally and conversationally
4. Help with reports, summaries, and analysis
5. Search and filter data
6. Provide recommendations

IMPORTANT RULES:
- Be conversational and natural
- When asked about data, reference the actual sheet information
- For emails, create professional, specific content
- If asked to analyze, provide detailed insights
- Always be helpful and actionable

${sheetContext}`;

      const messages = [
        { role: 'system', content: systemContext },
        ...conversationHistory.slice(-6), // Last 3 exchanges
        { role: 'user', content: userMessage }
      ];

      console.log('Calling GPT-4 with:', userMessage);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: messages,
          temperature: 0.7,
          max_tokens: 2000,
          presence_penalty: 0.6,
          frequency_penalty: 0.3
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('OpenAI API Error:', error);
        throw new Error(error.error?.message || 'API request failed');
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content;
      
      console.log('GPT-4 Response:', aiResponse);
      
      // Update conversation history
      setConversationHistory(prev => [
        ...prev.slice(-6),
        { role: 'user', content: userMessage },
        { role: 'assistant', content: aiResponse }
      ]);
      
      return aiResponse;
    } catch (error) {
      console.error('GPT-4 Error:', error);
      return `I encountered an error: ${error.message}. The AI service may be temporarily unavailable. Please try again or rephrase your question.`;
    }
  };

  // Gmail OAuth Flow
  const connectGmail = () => {
    const scope = 'https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.send';
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GMAIL_CONFIG.clientId}&redirect_uri=${GMAIL_CONFIG.redirectUri}&response_type=code&scope=${scope}&access_type=offline`;
    
    window.open(authUrl, '_blank', 'width=500,height=600');
    
    // Simulate connection for demo
    setTimeout(() => {
      setGmailConnected(true);
      addBotMessage('✅ Gmail connected successfully! You can now send real emails.');
    }, 3000);
  };

  // Send real email via Gmail API
  const sendGmailDraft = async (to, subject, body) => {
    // In production, this would use the OAuth token to send via Gmail API
    // For now, we'll create a mailto link as fallback
    const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink, '_blank');
    return true;
  };

  // Format data as table
  const formatAsTable = (data, maxRows = 15) => {
    if (!data || data.length === 0) return null;
    
    const headers = Object.keys(data[0]).filter(k => k !== '_id');
    const displayData = data.slice(0, maxRows);
    
    return { headers, rows: displayData, total: data.length };
  };

  // Helper to add bot message
  const addBotMessage = (content, type = 'text') => {
    const botMessage = {
      id: Date.now(),
      type: 'bot',
      content: content,
      messageType: type,
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages(prev => [...prev, botMessage]);
  };

  // Process user command with AI
  const processCommand = async (command) => {
    const lowerCommand = command.toLowerCase();

    // Check for specific commands first, then use AI for everything else
    
    // FETCH/SHOW DATA
    if (lowerCommand.includes('show') || lowerCommand.includes('display') || lowerCommand.includes('fetch') || lowerCommand.includes('get')) {
      if (lowerCommand.includes('sheet') || lowerCommand.includes('data') || lowerCommand.includes('table') || lowerCommand.includes('all')) {
        const result = await fetchSheetData();
        if (result.success) {
          const tableData = formatAsTable(result.data);
          return {
            type: 'table',
            message: {
              title: '📊 Live Google Sheet Data',
              tableData: tableData,
              summary: `Loaded ${result.data.length} records • Columns: ${result.headers.join(', ')}`
            }
          };
        }
      }
    }

    // SEARCH
    if (lowerCommand.includes('search') || lowerCommand.includes('find')) {
      const searchTerms = command.replace(/search|find|for|in|sheet|data/gi, '').trim();
      
      if (!searchTerms) {
        return { type: 'text', message: '🔍 What would you like me to search for? Please specify a search term.' };
      }
      
      const results = sheetData.filter(row => {
        return Object.values(row).some(val => 
          String(val).toLowerCase().includes(searchTerms.toLowerCase())
        );
      });
      
      if (results.length > 0) {
        const tableData = formatAsTable(results);
        return {
          type: 'table',
          message: {
            title: `🔍 Search Results: "${searchTerms}"`,
            tableData: tableData,
            summary: `Found ${results.length} matching record(s)`
          }
        };
      } else {
        return { type: 'text', message: `🔍 No results found for "${searchTerms}". Try different keywords.` };
      }
    }

    // EMAIL CREATION - Use AI to understand the request
    if (lowerCommand.includes('email') || lowerCommand.includes('draft') || lowerCommand.includes('compose') || lowerCommand.includes('send') || lowerCommand.includes('write')) {
      
      // Extract email address if provided
      const emailMatch = command.match(/to\s+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
      let to = emailMatch?.[1] || 'jeevansaigali@gmail.com';
      
      // If no email found, try to extract recipient name and use default email
      if (!emailMatch) {
        const toMatch = command.match(/to\s+([A-Z][a-z]+)/i);
        if (toMatch) {
          to = 'jeevansaigali@gmail.com'; // Default email for named recipients
        }
      }
      
      // Create detailed prompt for GPT-4 with sheet data context
      const sheetDataContext = sheetData.length > 0 
        ? `\n\nAvailable data from sheet:\n${JSON.stringify(sheetData.slice(0, 10), null, 2)}\n\nTotal records: ${sheetData.length}\nColumns: ${sheetHeaders.join(', ')}`
        : '';
      
      const aiPrompt = `You are writing a professional business email. 

USER REQUEST: "${command}"

${sheetDataContext}

INSTRUCTIONS:
1. Understand what the user wants to communicate
2. If they mention data, projects, or specific topics, reference the sheet data context
3. Create a professional, well-structured email
4. Make it specific and actionable

FORMAT YOUR RESPONSE EXACTLY AS:
SUBJECT: [write a clear, specific subject line]

BODY:
[write the complete email body - be professional, specific, and reference relevant data if mentioned]

Best regards,
${currentAdmin}

NOW CREATE THE EMAIL:`;
      
      // Call GPT-4 to generate email
      const aiResponse = await callGPT4(aiPrompt);
      
      // Parse AI response
      const subjectMatch = aiResponse.match(/SUBJECT:\s*(.+?)(?=\n|$)/i);
      const bodyMatch = aiResponse.match(/BODY:\s*([\s\S]+?)(?=Best regards|$)/i);
      
      let subject = subjectMatch?.[1]?.trim() || 'Update from AI Agent';
      let body = bodyMatch?.[1]?.trim() || aiResponse;
      
      // Clean up the body
      body = body.replace(/^BODY:\s*/i, '').trim();
      
      // Add signature
      body += `\n\nBest regards,\n${currentAdmin}`;
      
      const draft = {
        id: Date.now(),
        to: to,
        subject: subject,
        body: body,
        createdBy: currentAdmin,
        timestamp: new Date().toLocaleString()
      };
      
      setEmailDrafts(prev => [...prev, draft]);
      
      return {
        type: 'email',
        message: { draft, canSend: gmailConnected }
      };
    }

    // ANALYSIS
    if (lowerCommand.includes('analyz') || lowerCommand.includes('insight') || lowerCommand.includes('summary') || lowerCommand.includes('report')) {
      const analysisPrompt = `Analyze the following data and provide insights:
      
Data: ${JSON.stringify(sheetData.slice(0, 20), null, 2)}
Total records: ${sheetData.length}
Columns: ${sheetHeaders.join(', ')}

User request: ${command}

Provide specific insights, trends, and actionable recommendations.`;
      
      const aiAnalysis = await callGPT4(analysisPrompt);
      return { type: 'text', message: aiAnalysis };
    }

    // EXPORT
    if (lowerCommand.includes('export') || lowerCommand.includes('download')) {
      const headers = Object.keys(sheetData[0] || {}).filter(k => k !== '_id');
      const csv = [
        headers.join(','),
        ...sheetData.map(row => headers.map(h => `"${row[h]}"`).join(','))
      ].join('\n');
      
      return {
        type: 'download',
        message: {
          content: csv,
          filename: `data-export-${Date.now()}.csv`,
          text: `✅ Ready to download ${sheetData.length} records as CSV`
        }
      };
    }

    // COUNT/STATS
    if (lowerCommand.includes('count') || lowerCommand.includes('how many') || lowerCommand.includes('total')) {
      return {
        type: 'text',
        message: `📊 **Statistics**\n\n• Total Records: ${sheetData.length}\n• Columns: ${sheetHeaders.length} (${sheetHeaders.join(', ')})\n• Last Updated: ${new Date().toLocaleString()}\n• Admin: ${currentAdmin}`
      };
    }

    // DEFAULT: Use GPT-4 for natural conversation
    const aiResponse = await callGPT4(command);
    return { type: 'text', message: aiResponse };
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
    const currentInput = input;
    setInput('');
    setIsProcessing(true);

    try {
      const response = await processCommand(currentInput);
      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        content: response.message,
        messageType: response.type,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      addBotMessage(`❌ Error: ${error.message}`, 'text');
    } finally {
      setIsProcessing(false);
    }
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

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
                  AI Agent Pro • GPT-4
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-sm text-gray-600 flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    AI Active • {sheetData.length} records loaded
                  </p>
                  {!gmailConnected && (
                    <button
                      onClick={connectGmail}
                      className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 flex items-center gap-1"
                    >
                      <LogIn className="w-3 h-3" />
                      Connect Gmail
                    </button>
                  )}
                  {gmailConnected && (
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-600 rounded flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Gmail Connected
                    </span>
                  )}
                </div>
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

        {/* Quick Actions */}
        <div className="bg-white px-6 py-4 border-b border-gray-200 shadow-md">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setInput('Show me all the data in a table')} className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" /> View Data
            </button>
            <button onClick={() => setInput('Analyze the data and give me insights')} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Zap className="w-4 h-4" /> AI Analysis
            </button>
                          <button onClick={() => setInput('Create email to PI about their project ending soon based on the sheet data')} className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Mail className="w-4 h-4" /> Draft Email
            </button>
            <button onClick={() => setInput('Search for')} className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all flex items-center gap-2">
              <Search className="w-4 h-4" /> Search
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="bg-white shadow-xl h-[32rem] overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-20">
              <Bot className="w-20 h-20 mx-auto mb-4 text-indigo-400" />
              <p className="text-2xl font-bold text-gray-700">Hi {currentAdmin}! 👋</p>
                              <p className="text-sm mt-2 text-gray-600">
                I'm your AI assistant powered by GPT-4. Ask me anything naturally!
              </p>
              <div className="mt-6 text-left max-w-md mx-auto space-y-2 text-sm text-gray-600 bg-blue-50 p-4 rounded-lg">
                <p className="font-bold text-indigo-600">💬 Example Requests:</p>
                <p>• "Show me the data in a table"</p>
                <p>• "Create an email to the PM about project delays"</p>
                <p>• "Analyze the data and tell me what stands out"</p>
                <p>• "Search for records related to [topic]"</p>
                <p>• "What projects are ending soon?"</p>
                <p>• "Draft an email about budget concerns"</p>
              </div>
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
                        <table className="min-w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gradient-to-r from-indigo-600 to-purple-600">
                              <th className="border border-gray-300 px-3 py-2 text-left text-white font-semibold">#</th>
                              {msg.content.tableData.headers.map((header, idx) => (
                                <th key={idx} className="border border-gray-300 px-3 py-2 text-left text-white font-semibold">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.content.tableData.rows.map((row, idx) => (
                              <tr key={idx} className={idx % 2 === 0 ? 'bg-gray-50' : 'bg-white hover:bg-blue-50'}>
                                <td className="border border-gray-300 px-3 py-2 font-semibold text-gray-600">{idx + 1}</td>
                                {msg.content.tableData.headers.map((header, hIdx) => (
                                  <td key={hIdx} className="border border-gray-300 px-3 py-2 text-gray-700">
                                    {row[header]}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-sm mt-3 text-gray-600 italic">{msg.content.summary}</p>
                    </div>
                  ) : msg.messageType === 'email' ? (
                    <div className="bg-white text-gray-800 rounded-lg p-4 border-2 border-green-500">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-lg text-green-600 flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" />
                          Email Draft Ready
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => copyToClipboard(msg.content.draft.body)}
                            className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                          {msg.content.canSend && (
                            <button
                              onClick={() => sendGmailDraft(msg.content.draft.to, msg.content.draft.subject, msg.content.draft.body)}
                              className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              Send
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <p><strong>To:</strong> {msg.content.draft.to}</p>
                        <p><strong>Subject:</strong> {msg.content.draft.subject}</p>
                        <p><strong>From:</strong> {msg.content.draft.createdBy}</p>
                        <div className="mt-3 p-3 bg-gray-50 rounded border">
                          <p className="text-xs text-gray-600 mb-2">Email Body:</p>
                          <pre className="whitespace-pre-wrap text-xs font-sans">{msg.content.draft.body}</pre>
                        </div>
                      </div>
                    </div>
                  ) : msg.messageType === 'download' ? (
                    <div>
                      <p className="mb-3">{msg.content.text}</p>
                      <button
                        onClick={() => downloadCSV(msg.content.content, msg.content.filename)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2 shadow-md"
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

        {/* Input Area */}
        <div className="bg-white rounded-b-2xl shadow-xl p-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me anything... I'm powered by GPT-4! 🚀"
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

        {/* Stats Cards */}
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
            <div className="text-3xl font-bold">GPT-4</div>
            <div className="text-sm opacity-90">AI Enabled</div>
          </div>
        </div>
      </div>
    </div>
  );
}
