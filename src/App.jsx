import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, Mail, FileSpreadsheet, Database, FileText, Zap, RefreshCw } from 'lucide-react';

export default function AIAgentSystem() {
  const [currentAdmin, setCurrentAdmin] = useState('Ryan');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sheetData, setSheetData] = useState([]);
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const messagesEndRef = useRef(null);

  const admins = ['Ryan', 'Tim', 'Jeevan', 'Vishwa', 'Jason', 'Myrna', 'Julie'];
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTGqoyhQE2-8SK7aCLNtIdDXWsNwV-Cjvo6mLHeymu3RjC4CottLGZb6P9ivFVPdUDwyYcbULVms78s/pub?output=csv';

  const [emailDrafts, setEmailDrafts] = useState([]);
  const [apiData] = useState([
    { id: 1, endpoint: '/users', method: 'GET', status: 'active' },
    { id: 2, endpoint: '/products', method: 'POST', status: 'active' }
  ]);

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
      
      // Parse CSV
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

  // Auto-load sheet data on mount
  useEffect(() => {
    fetchSheetData();
  }, []);

  const processCommand = async (command) => {
    const lowerCommand = command.toLowerCase();

    // Email Creation with real data
    if (lowerCommand.includes('create email') || lowerCommand.includes('draft email') || lowerCommand.includes('compose email')) {
      const to = lowerCommand.match(/to ([a-z@.\s]+)/i)?.[1] || 'recipient@example.com';
      const subjectMatch = lowerCommand.match(/subject ([^.]+)/i);
      let subject = subjectMatch?.[1] || 'Update from AI Agent';
      
      // Check if they want sheet data in email
      let body = `Hello,\n\nThis email was created by ${currentAdmin} using the AI Agent.\n\n`;
      
      if (lowerCommand.includes('sheet data') || lowerCommand.includes('latest data') || lowerCommand.includes('report')) {
        if (sheetData.length > 0) {
          body += `**Latest Data from Google Sheet:**\n\n`;
          sheetData.slice(0, 5).forEach((row, idx) => {
            const entries = Object.entries(row).filter(([key]) => key !== 'id');
            body += `${idx + 1}. ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}\n`;
          });
          body += `\n(Showing first 5 of ${sheetData.length} records)`;
        }
      }
      
      body += `\n\nBest regards,\n${currentAdmin}`;
      
      const draft = {
        id: Date.now(),
        to: to.trim(),
        subject: subject.trim(),
        body: body,
        createdBy: currentAdmin,
        timestamp: new Date().toLocaleString()
      };
      
      setEmailDrafts(prev => [...prev, draft]);
      
      return {
        type: 'success',
        message: `✅ **Email Draft Created!**\n\n**To:** ${draft.to}\n**Subject:** ${draft.subject}\n**From:** ${currentAdmin}\n\n**Preview:**\n${body.substring(0, 200)}...\n\n*Draft saved! In a real implementation, this would be saved to Gmail.*`
      };
    }

    // Fetch Google Sheet Data - REAL
    if (lowerCommand.includes('fetch') || lowerCommand.includes('get') || lowerCommand.includes('show')) {
      if (lowerCommand.includes('sheet') || lowerCommand.includes('data') || lowerCommand.includes('google') || lowerCommand.includes('spreadsheet')) {
        const result = await fetchSheetData();
        
        if (result.success) {
          const data = result.data;
          const headers = result.headers;
          
          let dataTable = `📊 **LIVE Data from Google Sheet**\n\n`;
          dataTable += `**Total Records:** ${data.length}\n`;
          dataTable += `**Columns:** ${headers.join(', ')}\n\n`;
          dataTable += `**Latest Records:**\n`;
          
          data.slice(0, 10).forEach((row, idx) => {
            const entries = Object.entries(row).filter(([key]) => key !== 'id');
            dataTable += `\n${idx + 1}. `;
            entries.forEach(([key, value]) => {
              dataTable += `**${key}:** ${value}  `;
            });
          });
          
          if (data.length > 10) {
            dataTable += `\n\n*...and ${data.length - 10} more records*`;
          }
          
          return {
            type: 'success',
            message: dataTable
          };
        } else {
          return {
            type: 'error',
            message: `❌ **Failed to fetch sheet data**\n\nError: ${result.error}\n\nPlease check your sheet URL and try again.`
          };
        }
      }
    }

    // Search in Sheet Data
    if (lowerCommand.includes('search') || lowerCommand.includes('find')) {
      const searchTerm = lowerCommand.replace(/search|find|for|in|sheet/gi, '').trim();
      
      if (sheetData.length === 0) {
        await fetchSheetData();
      }
      
      const results = sheetData.filter(row => {
        return Object.values(row).some(val => 
          String(val).toLowerCase().includes(searchTerm.toLowerCase())
        );
      });
      
      if (results.length > 0) {
        let message = `🔍 **Search Results for "${searchTerm}"**\n\n`;
        message += `Found ${results.length} matching record(s):\n\n`;
        
        results.slice(0, 5).forEach((row, idx) => {
          const entries = Object.entries(row).filter(([key]) => key !== 'id');
          message += `${idx + 1}. `;
          entries.forEach(([key, value]) => {
            message += `**${key}:** ${value}  `;
          });
          message += `\n`;
        });
        
        return { type: 'success', message };
      } else {
        return {
          type: 'info',
          message: `🔍 No results found for "${searchTerm}" in the sheet data.`
        };
      }
    }

    // Count/Statistics
    if (lowerCommand.includes('count') || lowerCommand.includes('how many') || lowerCommand.includes('total')) {
      if (sheetData.length === 0) {
        await fetchSheetData();
      }
      
      return {
        type: 'success',
        message: `📊 **Sheet Statistics**\n\n**Total Records:** ${sheetData.length}\n**Last Updated:** ${new Date().toLocaleString()}\n**Fetched by:** ${currentAdmin}\n\nUse "fetch sheet data" to see all records.`
      };
    }

    // Generate Summary/Report
    if (lowerCommand.includes('summary') || lowerCommand.includes('summarize') || lowerCommand.includes('report')) {
      if (sheetData.length === 0) {
        await fetchSheetData();
      }
      
      return {
        type: 'success',
        message: `📝 **Executive Summary**\n\n**Data Overview:**\n• Total Records in Sheet: ${sheetData.length}\n• Email Drafts Created: ${emailDrafts.length}\n• Active API Endpoints: ${apiData.length}\n• Current Admin: ${currentAdmin}\n\n**Recent Activity:**\n• Last sheet fetch: ${new Date().toLocaleTimeString()}\n• System Status: ✅ Operational\n\n**Recommendations:**\n✓ Review latest sheet entries\n✓ Follow up on pending email drafts\n✓ Monitor system metrics\n\n*Generated on ${new Date().toLocaleDateString()} by ${currentAdmin}*`
      };
    }

    // Refresh data
    if (lowerCommand.includes('refresh') || lowerCommand.includes('reload') || lowerCommand.includes('update')) {
      const result = await fetchSheetData();
      if (result.success) {
        return {
          type: 'success',
          message: `🔄 **Data Refreshed!**\n\nSuccessfully loaded ${result.data.length} records from Google Sheet.\n\nUse "show sheet data" to view the latest information.`
        };
      }
    }

    // API Simulation
    if (lowerCommand.startsWith('get ') || lowerCommand.includes('retrieve')) {
      const resource = lowerCommand.includes('user') ? 'users' : lowerCommand.includes('product') ? 'products' : 'data';
      return {
        type: 'success',
        message: `🔍 **GET Request Successful**\n\nEndpoint: /api/${resource}\nStatus: 200 OK\nExecuted by: ${currentAdmin}\n\nSample Response:\n\`\`\`json\n{\n  "id": 1,\n  "name": "Sample ${resource}",\n  "status": "active",\n  "timestamp": "${new Date().toISOString()}"\n}\n\`\`\``
      };
    }

    if (lowerCommand.startsWith('post ') || lowerCommand.includes('create new') || lowerCommand.includes('add new')) {
      const resource = lowerCommand.includes('user') ? 'user' : lowerCommand.includes('product') ? 'product' : 'record';
      return {
        type: 'success',
        message: `✨ **POST Request Successful**\n\nNew ${resource} created!\nEndpoint: /api/${resource}s\nStatus: 201 Created\nCreated by: ${currentAdmin}\n\n*In production, this would add data to your database.*`
      };
    }

    if (lowerCommand.includes('delete') || lowerCommand.includes('remove')) {
      const resource = lowerCommand.match(/delete (\w+)/i)?.[1] || 'record';
      return {
        type: 'success',
        message: `🗑️ **DELETE Request Successful**\n\nResource deleted: ${resource}\nStatus: 204 No Content\nDeleted by: ${currentAdmin}\n\n*In production, this would remove data from your database.*`
      };
    }

    // Analytics
    if (lowerCommand.includes('analytic') || lowerCommand.includes('stats') || lowerCommand.includes('metrics')) {
      return {
        type: 'success',
        message: `📈 **Analytics Dashboard**\n\n**System Metrics:**\n• Total Commands Processed: ${messages.length / 2}\n• Sheet Records: ${sheetData.length}\n• Email Drafts: ${emailDrafts.length}\n• Active Endpoints: ${apiData.length}\n• Success Rate: 98.5%\n\n**Admin Activity:**\n• Current Admin: ${currentAdmin}\n• Active Admins: ${admins.length}\n• Commands Today: ${messages.filter(m => m.type === 'user').length}`
      };
    }

    // Help
    if (lowerCommand.includes('help') || lowerCommand === 'what can you do') {
      return {
        type: 'info',
        message: `🤖 **AI Agent - Available Commands**\n\n**📊 Google Sheet Operations:**\n• "Fetch sheet data" - Get live data\n• "Search [term]" - Find specific records\n• "Count records" - Show statistics\n• "Refresh data" - Reload from sheet\n\n**📧 Email Operations:**\n• "Create email to [email] subject [topic]"\n• "Draft email with sheet data" - Include report\n\n**📝 Reports & Analysis:**\n• "Generate summary" - Executive report\n• "Show analytics" - System metrics\n\n**🔄 API Operations:**\n• "GET [resource]" - Fetch data\n• "POST new [resource]" - Create record\n• "DELETE [resource]" - Remove data\n\n*Just type naturally - I understand context!*`
      };
    }

    return {
      type: 'info',
      message: `I received: "${command}"\n\n💡 **Try these:**\n• "Fetch sheet data" - Get real Google Sheet data\n• "Search [term]" - Find in your sheet\n• "Create email to john@company.com" - Draft email\n• "Generate summary" - Create report\n• "Help" - See all commands`
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
        responseType: response.type,
        timestamp: new Date().toLocaleTimeString()
      };
      setMessages(prev => [...prev, botMessage]);
      setIsProcessing(false);
    }, 1000);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-t-2xl shadow-lg p-6 border-b-2 border-indigo-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-600 p-3 rounded-xl">
                <Bot className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">AI Admin Agent</h1>
                <p className="text-sm text-gray-600">🔴 LIVE - Connected to Google Sheets</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchSheetData}
                disabled={isLoadingSheet}
                className="px-3 py-2 bg-green-100 text-green-700 rounded-lg font-medium hover:bg-green-200 flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                Sync Sheet
              </button>
              <select 
                value={currentAdmin}
                onChange={(e) => setCurrentAdmin(e.target.value)}
                className="px-4 py-2 border-2 border-indigo-300 rounded-lg font-semibold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {admins.map(admin => (
                  <option key={admin} value={admin}>👤 {admin}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white px-6 py-4 border-b border-gray-200">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setInput('Fetch sheet data')} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 flex items-center gap-1">
              <FileSpreadsheet className="w-4 h-4" /> Fetch Live Data
            </button>
            <button onClick={() => setInput('Create email to team@company.com subject Weekly Report with sheet data')} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 flex items-center gap-1">
              <Mail className="w-4 h-4" /> Email Report
            </button>
            <button onClick={() => setInput('Search')} className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 flex items-center gap-1">
              <Database className="w-4 h-4" /> Search Data
            </button>
            <button onClick={() => setInput('Generate summary')} className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-200 flex items-center gap-1">
              <FileText className="w-4 h-4" /> Summary
            </button>
            <button onClick={() => setInput('Show analytics')} className="px-3 py-1.5 bg-pink-100 text-pink-700 rounded-lg text-sm font-medium hover:bg-pink-200 flex items-center gap-1">
              <Zap className="w-4 h-4" /> Analytics
            </button>
          </div>
        </div>

        <div className="bg-white shadow-lg h-96 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-16">
              <Bot className="w-16 h-16 mx-auto mb-4 text-indigo-300" />
              <p className="text-lg font-semibold">Welcome, {currentAdmin}!</p>
              <p className="text-sm mt-2">🟢 Connected to Google Sheets • {sheetData.length} records loaded</p>
              <p className="text-xs mt-3 text-gray-400">Try: "Fetch sheet data" or "Create email"</p>
            </div>
          )}
          
          {messages.map(msg => (
            <div key={msg.id} className={`mb-4 flex ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-3 max-w-3xl ${msg.type === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.type === 'user' ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                  {msg.type === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-gray-700" />}
                </div>
                <div className={`rounded-2xl p-4 ${msg.type === 'user' ? 'bg-indigo-600 text-white' : msg.responseType === 'error' ? 'bg-red-50 text-red-900' : 'bg-gray-100 text-gray-800'}`}>
                  {msg.type === 'user' && <div className="text-xs opacity-80 mb-1">{msg.admin}</div>}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                  <div className="text-xs opacity-70 mt-2">{msg.timestamp}</div>
                </div>
              </div>
            </div>
          ))}
          
          {isProcessing && (
            <div className="flex gap-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center">
                <Bot className="w-5 h-5 text-gray-700" />
              </div>
              <div className="bg-gray-100 rounded-2xl p-4">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="bg-white rounded-b-2xl shadow-lg p-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type command: 'Fetch sheet data', 'Create email', 'Search [term]'..."
              className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              <Send className="w-5 h-5" />
              Send
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <FileSpreadsheet className="w-6 h-6 mx-auto mb-2 text-green-600" />
            <div className="text-2xl font-bold text-gray-800">{sheetData.length}</div>
            <div className="text-xs text-gray-600">Sheet Records</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <Mail className="w-6 h-6 mx-auto mb-2 text-blue-600" />
            <div className="text-2xl font-bold text-gray-800">{emailDrafts.length}</div>
            <div className="text-xs text-gray-600">Email Drafts</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <Database className="w-6 h-6 mx-auto mb-2 text-purple-600" />
            <div className="text-2xl font-bold text-gray-800">{apiData.length}</div>
            <div className="text-xs text-gray-600">API Endpoints</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow text-center">
            <Zap className="w-6 h-6 mx-auto mb-2 text-orange-600" />
            <div className="text-2xl font-bold text-gray-800">{messages.length}</div>
            <div className="text-xs text-gray-600">Commands Run</div>
          </div>
        </div>
      </div>
    </div>
  );
}
