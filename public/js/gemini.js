import { showNotification } from './notifications.js';

let isProcessing = false;
const chatMessages = document.querySelector('.chat-messages');
const chatInput = document.querySelector('.chat-input');
const sendButton = document.querySelector('.send-btn');
const typingIndicator = document.querySelector('.typing-indicator');

// Check authentication
async function checkAuth() {
    const userToken = localStorage.getItem('userToken');
    if (!userToken) {
        showNotification('Please login first', 'error');
        window.location.href = '/';
        return false;
    }
    return true;
}

function addMessage(content, isUser = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
    
    // Add animation delay based on messages count
    const messages = document.querySelectorAll('.message');
    messageDiv.style.animationDelay = `${messages.length * 0.1}s`;

    if (isUser) {
        messageDiv.textContent = content;
    } else {
        try {
            const text = typeof content === 'object' ? content.text : content;
            let processedText = text;

            if (text.includes('```')) {
                // Simplified code block handling without copy button
                processedText = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
                    const language = lang || 'plaintext';
                    return `<div class="code-block">
                        <div class="language-indicator">${language}</div>
                        <pre><code class="language-${language}">${code.trim()}</code></pre>
                    </div>`;
                });
            }

            // Handle inline code
            processedText = processedText.replace(/`([^`]+)`/g, '<code>$1</code>');
            messageDiv.innerHTML = processedText;
        } catch (error) {
            console.error('Error processing message:', error);
            messageDiv.textContent = 'Error displaying message';
        }
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendMessage(message) {
    if (isProcessing) return;
    isProcessing = true;
    
    // Show typing indicator with improved animation
    typingIndicator.style.display = 'flex';
    typingIndicator.innerHTML = 'AI is typing<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span>';
    typingIndicator.style.animation = 'slideIn 0.3s ease-out';

    try {
        const res = await fetch('/gemini-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`
            },
            body: JSON.stringify({ message })
        });

        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Failed to get response');
        }
        
        const data = await res.json();
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Add the response to chat
        addMessage(data);
    } catch (error) {
        showNotification(error.message || 'Failed to get response', 'error');
        console.error('Error:', error);
    } finally {
        // Smooth fade out for typing indicator
        typingIndicator.style.opacity = '0';
        await new Promise(r => setTimeout(r, 300));
        typingIndicator.style.display = 'none';
        typingIndicator.style.opacity = '1';
        isProcessing = false;
    }
}

function setupEventListeners() {
    sendButton.addEventListener('click', () => {
        const message = chatInput.value.trim();
        if (message) {
            addMessage(message, true);
            sendMessage(message);
            chatInput.value = '';
        }
    });

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendButton.click();
        }
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (await checkAuth()) {
        setupEventListeners();
        // Add welcome message
        addMessage("Hi! I'm your AI assistant. How can I help you today?");
    }
});
