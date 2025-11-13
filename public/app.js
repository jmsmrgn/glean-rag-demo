// ============================================================================
// Glean RAG Assistant - React Application
// ============================================================================

const { useState, useEffect, useRef } = React;

// Configure marked for better formatting
if (typeof marked !== "undefined") {
  marked.setOptions({
    breaks: true, // Convert \n to <br>
    gfm: true, // GitHub Flavored Markdown
  });
}

// Helper function to render markdown safely
function renderMarkdown(text) {
  if (typeof marked === "undefined") {
    return text; // Fallback if marked isn't loaded
  }
  return marked.parse(text);
}

function ChatApp() {
  // State management
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState("rag"); // 'basic', 'websearch', or 'rag'
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle sending messages to the API
  const sendMessage = async (e) => {
    e.preventDefault();

    if (!inputValue.trim()) return;

    const userMessage = inputValue.trim();

    // Add user message to UI
    setMessages((prev) => [
      ...prev,
      {
        text: userMessage,
        sender: "user",
        timestamp: new Date(),
      },
    ]);

    setInputValue("");
    setIsLoading(true);

    try {
      // Call appropriate API endpoint based on selected mode
      const endpointMap = {
        basic: "/api/chat-basic",
        websearch: "/api/chat-websearch",
        rag: "/api/chat",
      };
      const endpoint = endpointMap[mode];

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Add assistant response with sources and mode indicator
      setMessages((prev) => [
        ...prev,
        {
          text: data.response,
          sender: "assistant",
          timestamp: new Date(),
          sources: data.sources || [],
          mode: mode, // Store which mode was used
        },
      ]);
    } catch (error) {
      console.error("Error sending message:", error);

      setMessages((prev) => [
        ...prev,
        {
          text: "Sorry, I encountered an error. Please try again.",
          sender: "assistant",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="chat-container">
      {/* Header */}
      <div className="chat-header">
        <div className="header-content">
          <div>
            <h1>Glean Assistant</h1>
          </div>
          <div className="mode-selector">
            <button
              className={`mode-button ${mode === "basic" ? "active" : ""}`}
              onClick={() => setMode("basic")}
              title="Pure OpenAI (training data only)"
            >
              💬 Basic
            </button>
            <button
              className={`mode-button ${mode === "websearch" ? "active" : ""}`}
              onClick={() => setMode("websearch")}
              title="OpenAI + Web Search"
            >
              🌐 Web Search
            </button>
            <button
              className={`mode-button ${mode === "rag" ? "active" : ""}`}
              onClick={() => setMode("rag")}
              title="RAG with internal docs"
            >
              🔬 RAG
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <h2>Ask a question</h2>
            <p>RAG is scoped to docs.glean.com/user-guide/ content only</p>
            <p style={{ marginTop: "12px", fontSize: "13px", opacity: 0.7 }}>
              💡 Modes: <strong>Basic</strong> (training data),
              <strong>Web Search</strong> (live web), and <strong>RAG</strong>{" "}
              (internal docs)
            </p>
          </div>
        ) : (
          <>
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.sender}`}>
                {message.sender === "assistant" && message.mode && (
                  <div className={`mode-badge ${message.mode}`}>
                    {message.mode === "rag" && "🔬 RAG Mode"}
                    {message.mode === "websearch" && "🌐 Web Search"}
                    {message.mode === "basic" && "💬 Basic Mode"}
                  </div>
                )}
                <div
                  className="message-bubble"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(message.text),
                  }}
                />

                {message.sender === "assistant" &&
                  message.sources &&
                  message.sources.length > 0 && (
                    <div className="message-footer">
                      <div className="sources-footer">
                        {message.sources.slice(0, 3).map((source, idx) => {
                          // Format source label: use title for web sources, path for docs
                          const sourceUrl = source.metadata?.source || "";
                          let label;

                          if (source.metadata?.title) {
                            // Web search result with title
                            label = source.metadata.title;
                          } else if (sourceUrl.includes("docs.glean.com")) {
                            // Glean docs: show just the page slug
                            label = sourceUrl.split("/").pop() || "Source";
                          } else {
                            // Other: show domain
                            try {
                              const url = new URL(sourceUrl);
                              label = url.hostname.replace("www.", "");
                            } catch {
                              label = "Web Source";
                            }
                          }

                          return (
                            <a
                              key={idx}
                              href={sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="source-link"
                              title={sourceUrl}
                            >
                              {label} ({Math.round(source.similarity * 100)}%)
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="message assistant loading">
                <div className="message-bubble">
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                  <div className="loading-dot"></div>
                </div>
              </div>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input form */}
      <form onSubmit={sendMessage} className="input-container">
        <input
          type="text"
          className="message-input"
          placeholder="Type your message..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="send-button"
          disabled={isLoading || !inputValue.trim()}
        >
          {isLoading ? "Sending..." : "Send"}
        </button>
      </form>
    </div>
  );
}

// Render the app
ReactDOM.render(<ChatApp />, document.getElementById("root"));
