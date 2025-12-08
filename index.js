import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { Groq } from 'groq-sdk';
import express from 'express';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

// Note: For ElevenLabs and audio conversion, we'll address those functions 
// in a subsequent step as they require external dependencies (like FFmpeg).
// We'll focus on text/media first.

// --- FILE PATH & REQUIRE SETUP ---
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// You will need the 'node-fetch' package to replace the 'requests' module.
const fetch = require('node-fetch'); 

// ----------------------------
// API Tokens & Constants (Using process.env for security)
// ----------------------------
const BOT_API_TOKEN = process.env.DISCORD_BOT_TOKEN; 
const NEW_API_KEY = process.env.GROQ_API_KEY; 
const GROUP_CHAT_ID = '-1002262322366'; // Telegram Group ID (Note: Discord uses Guild/Channel IDs)
const SPECIAL_USER = '1013151135122591754'; // Discord username check requires fetching/caching

// --- DISCORD SPECIFIC IDs ---
// Replace with your actual Discord Guild (Server) ID and a Channel ID for cross-checking
const GUILD_ID = '1447411522539098124'; 
const TARGET_CHANNEL_ID = '1447411524162424864'; 

const MAX_MESSAGES = 5;
const MAX_CHARACTER_LIMIT = 5000;

// ----------------------------
// Initialize Clients
// ----------------------------
const app = express();
const groqClient = new Groq({ apiKey: NEW_API_KEY });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages, // For private chat support
    ],
    partials: [Partials.Channel, Partials.Message], // Necessary for DMs/caching
});

// ----------------------------
// Data Structures (Memory, Rate Limiting)
// ----------------------------
// Maps are the JavaScript equivalent of Python's defaultdict
const chatMemory = new Map(); // Key: user_id, Value: Array of messages (fixed size queue)
const userLastRequest = new Map(); // For rate limiting

// ----------------------------
// Emotion URLs (Direct Image URLs for Discord Embeds)
// ----------------------------
const EMOTION_URLS = {
    // ... (All your image URLs go here, e.g., "https://i.ibb.co/Fkgs2V7n/image.png")
    "smirk": "https://i.ibb.co/Fkgs2V7n/image.png",
    "laugh": "https://i.ibb.co/hkW24gc/image.png",
    // Add all remaining emotion URLs here...
};

// ----------------------------
// Helper Functions
// ----------------------------

/**
 * Truncates message content for character limit management.
 */
function truncateMessage(message, max_length = 200) {
    if (message.content.length > max_length) {
        message.content = message.content.substring(0, max_length) + "...";
    }
    return message;
}

/**
 * Checks if the user is a member of the required Discord Guild (Server).
 * This is the equivalent of Telegram's check_group_membership.
 */
async function checkGroupMembership(user, channel) {
    // Skip check for the special user
    if (user.username === SPECIAL_USER.substring(1)) {
        return true;
    }

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) {
            console.error(`Guild with ID ${GUILD_ID} not found.`);
            return false;
        }

        const member = await guild.members.fetch(user.id).catch(() => null);

        if (member) {
            return true;
        } else {
            // Note: Discord allows direct invite URLs.
            const inviteUrl = 'https://discord.gg/bxSnZQBsdf'; 
            
            const joinButton = {
                type: 1, // ActionRow
                components: [
                    {
                        type: 2, // Button
                        style: 5, // Link
                        label: `✅ Join @squad13girls`,
                        url: inviteUrl,
                    },
                ],
            };

            await channel.send({ 
                content: `To use me, join **@squad13girls** first!`,
                components: [joinButton]
            });
            return false;
        }
    } catch (e) {
        console.error(`Discord Guild check failed: ${e.message}`);
        await channel.send("I couldn't verify your membership. Please try again later.");
        return false;
    }
}

/**
 * Parses AI output for {{emotion}}, sends the media, and posts the caption.
 */
function parseEmotionAndSend(message, text) {
    const emotionPattern = /\{\{(\w+)\}\}/;
    const match = text.match(emotionPattern);
    
    let mediaUrlToSend = null;
    let captionToSend = text; 

    if (match) {
        const emotion = match[1].toLowerCase();
        
        if (EMOTION_URLS[emotion]) {
            mediaUrlToSend = EMOTION_URLS[emotion];
            // Remove the emotion tag for the caption
            captionToSend = text.replace(emotionPattern, "").trim();
        }
    }

    try {
        if (mediaUrlToSend) {
            // Discord handles images and GIFs cleanly via files/embeds.
            // Sending the URL in the 'files' array is often the simplest way.
            // We use 'content' for the caption and 'files' for the image URL.
            message.reply({ 
                content: captionToSend, 
                files: [{ attachment: mediaUrlToSend }] 
            });
        } else {
            // Send plain text fallback
            message.reply({ content: captionToSend });
        }
    } catch (e) {
        console.error(`Failed to send media/caption: ${e.message}`);
        message.reply(`Error processing message: ${captionToSend}`);
    }
}


// ----------------------------
// Groq AI Handler
// ----------------------------

async function processMessageForAi(message) {
    const userId = message.author.id;
    const userUsername = message.author.username;
    
    // 1. Memory Management (Fixed size queue)
    if (!chatMemory.has(userId)) {
        chatMemory.set(userId, []);
    }
    const userHistory = chatMemory.get(userId);

    // Add user message
    userHistory.push({ role: "user", content: message.content });
    if (userHistory.length > MAX_MESSAGES) {
        userHistory.shift(); // Remove the oldest entry
    }

    // 2. Prepare history and system prompt
    const historyToSend = userHistory.map(msg => truncateMessage({ ...msg })); // Truncate and copy

    const systemPromptContent = (
        "You are Rias Gremory, a noble and powerful demon from High School DxD. "
        // ... (Include your full system prompt here) ...
    );
    
    const messagesToSend = [
        { role: "system", content: systemPromptContent },
        ...historyToSend
    ];

    // 3. Groq API Call
    try {
        const response = await groqClient.chat.completions.create({
            messages: messagesToSend,
            model: "llama-3.3-70b-versatile", // Ensure this model name is correct
        });
        
        const replyText = response.choices[0].message.content;

        // 4. Append AI response to memory
        userHistory.push({ role: "assistant", content: replyText });
        if (userHistory.length > MAX_MESSAGES) {
            userHistory.shift();
        }
        
        // 5. Send the response
        parseEmotionAndSend(message, replyText);

    } catch (e) {
        console.error(`Groq API Error for user ${userId}: ${e.message}`);
        message.reply("Sorry, I couldn't process your request at the moment.");
    }
}


// ----------------------------
// Message Listener
// ----------------------------
client.on('messageCreate', async message => {
    // Ignore commands and bots
    if (message.author.bot || message.content.startsWith('/')) {
        return;
    }

    const isDirectMessage = message.channel.type === 1; // DM channel type
    
    // Check if the message mentions the bot or is a direct message
    const isMentioned = message.mentions.users.has(client.user.id);

    // Determine if we should process the message
    let shouldProcess = isDirectMessage || isMentioned;

    // Optional: Group check for the general channel
    if (!shouldProcess && message.guild && message.channel.id === TARGET_CHANNEL_ID) {
        // You can add logic here if you want the bot to talk in a specific channel 
        // without a mention/reply, but for privacy/control, mention/DM is safer.
        // For now, let's stick to DM or Mention/Reply.
    }
    
    if (shouldProcess) {
        // 1. Group/Membership Check
        const isMember = await checkGroupMembership(message.author, message.channel);
        if (!isMember) {
            return; // Exit if not a member and not special user
        }

        // 2. Process for AI
        await processMessageForAi(message);
    }
});


// ----------------------------
// Keep-alive & Login
// ----------------------------
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is awake and running!'));
app.listen(PORT, () => console.log(`Keep-Alive server running on port ${PORT}`));

client.on('ready', () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    // Optional: Set bot presence here
});

client.login(BOT_API_TOKEN);
