import {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ApplicationCommandType,
    ApplicationCommandOptionType 
} from 'discord.js';
import { Groq } from 'groq-sdk';
import express from 'express';
// import { ElevenLabsClient } from 'elevenlabs'; // 🛑 REMOVED DUE TO SDK ERROR
import { setTimeout } from 'timers/promises';
import { randomInt } from 'crypto';
import fetch from 'node-fetch'; // Required for direct API calls
import dotenv from 'dotenv';
import fs from 'fs/promises'; // Use promises version for async/await

// Load environment variables
dotenv.config();

// ----------------------------
// API Tokens & Constants
// ----------------------------
const BOT_API_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Validate required environment variables
if (!BOT_API_TOKEN || !GROQ_API_KEY || !ELEVENLABS_API_KEY) {
    console.error('❌ Missing required environment variables. Please check Render settings.');
    process.exit(1);
}

const ELEVENLABS_VOICE_ID = 'cgSgspJ2msm6clMCkdW9'; // Rias Gremory Voice ID

// Discord IDs - REPLACE WITH YOUR ACTUAL IDs
const SPECIAL_USER_ID = '1013151135122591754';
const GUILD_ID = '1447411522539098124';
const TARGET_CHANNEL_ID = '1447411524162424864';

const MAX_MESSAGES = 5;
const MAX_CHARACTER_LIMIT = 5000;
const MESSAGE_COOLDOWN = 10; // seconds
const VOICE_DAILY_LIMIT = 1;

// ----------------------------
// Initialize Clients
// ----------------------------
const app = express();
const groqClient = new Groq({ apiKey: GROQ_API_KEY });
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User],
});

// ----------------------------
// Data Structures
// ----------------------------
const chatMemory = new Map(); // userId -> message history
const userLastRequest = new Map(); // userId -> timestamp
const userLastVoiceUsage = new Map(); // userId -> date string

// ----------------------------
// Media URLs
// ----------------------------
const GIF_URLS_WITH_CAPTIONS = [
    ['https://i.imgur.com/QvXVd8Y.gif', ''],
    ['https://i.imgur.com/l5M0XeB.gif', ''],
    ['https://i.imgur.com/JkFj7qP.gif', 'Hmm. This changes things...'],
    ['https://i.imgur.com/9HwQhXr.gif', ''],
    ['https://i.imgur.com/5QcFZ4K.gif', 'Don\'t get ideas…']
];

const GIF_INTRO_URL = 'https://i.imgur.com/fRiasIntro.gif'; 

// ----------------------------
// Emotion URLs
// ----------------------------
const EMOTION_URLS = {
    "smirk": "https://i.ibb.co/Fkgs2V7n/image.png",
    "laugh": "https://i.ibb.co/hkW24gc/image.png",
    "wink": "https://i.ibb.co/WWF5MNXn/image.png",
    "hug": "https://i.ibb.co/7tQjxvZ4/image.png",
    "confident_smirk": "https://i.ibb.co/1f8tFDJm/image.png",
    "sly_glance": "https://i.ibb.co/4gPdPzVS/image.png",
    "teasing_whisper": "https://i.ibb.co/JwZNG9rC/image.png",
    "gift_pause": "https://i.ibb.co/BHbzG7Zp/image.png",
    "quiet_pride": "https://i.ibb.co/ZzTxLfJx/image.png",
    "fond_exasperation": "https://i.ibb.co/ccsKsYYL/image.png",
    "playful_tease": "https://i.ibb.co/dsyrFWKL/image.png",
    "romantic_gaze": "https://i.ibb.co/Rkr8fvGb/image.png",
    "mysterious_smile": "https://i.ibb.co/HfTdK4vm/image.png",
    "peerage_leader_mode": "https://i.ibb.co/xKnGRwQc/image.png",
    "silent_agreement": "https://i.ibb.co/YFVn3JRZ/image.png",
    "gentle_nudge": "https://i.ibb.co/21K5khB4/image.png",
    "thinking": "https://i.ibb.co/sd5z9q7p/image.png",
    "curious": "https://i.ibb.co/rR7SCS6G/image.png",
    "surprised": "https://i.ibb.co/h1dq4smy/image.png",
    "listening_attentive": "https://i.ibb.co/nMx11sJV/image.png",
    "calm_assurance": "https://i.ibb.co/0px82gnQ/image.png",
    "joyful_laugh": "https://i.ibb.co/S4GdjrLM/image.png",
    "reflective_quiet": "https://i.ibb.co/Ng1rfvxh/image.png",
    "supportive_comfort": "https://i.ibb.co/KTPWYRR/image.png",
    "mischievous_smirk": "https://i.ibb.co/SXFzNdcb/image.png",
    "blushing": "https://i.ibb.co/c5WjsRD/image.png",
    "annoyed": "https://i.ibb.co/xK8Tt0qF/image.png",
    "confused": "https://i.ibb.co/Q7qYbQPj/image.png",
    "happy": "https://i.ibb.co/20XB23cC/image.png",
    "shocked": "https://i.ibb.co/B18hF7P/image.png",
    "skeptical": "https://i.ibb.co/QFXCKWf4/image.png",
    "nervous": "https://i.ibb.co/XxkQPWXT/image.png",
    "pleased": "https://i.ibb.co/3mKSmHkV/image.png",
    "calm": "https://i.ibb.co/S4c4Cs0t/image.png",
    "disappointed": "https://i.ibb.co/XZP3FqJK/image.png",
    "configcfg": "https://i.ibb.co/dw0qTqXy/image.png"
};

// ----------------------------
// Helper Functions
// ----------------------------
function truncateMessage(message, maxLength = 200) {
    if (!message.content) return message;
    if (message.content.length > maxLength) {
        return { ...message, content: message.content.substring(0, maxLength) + "..." };
    }
    return message;
}

function cleanText(text) {
    // Remove all text inside {{...}} and trim any leading/trailing whitespace
    return text.replace(/\{\{.*?\}\}/g, "").trim();
}

async function checkGroupMembership(user, channel) {
    if (user.id === SPECIAL_USER_ID) return true;

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        if (!guild) return false;
        const member = await guild.members.fetch(user.id).catch(() => null);

        if (member) {
            return true;
        } else {
            const inviteUrl = 'https://discord.gg/bxSnZQBsdf';
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('✅ Join @squad13girls').setURL(inviteUrl).setStyle(ButtonStyle.Link)
            );
            // Use channel.send for general messages, even if triggered by an interaction
            await channel.send({ content: "To use me, join **@squad13girls** first!", components: [row] });
            return false;
        }
    } catch (e) {
        console.error(`Discord Guild check failed: ${e.message}`);
        return false;
    }
}

function isUserAllowed(userId) {
    if (userId === SPECIAL_USER_ID) return true;
    const now = Date.now();
    const last = userLastRequest.get(userId) || 0;
    if (now - last < MESSAGE_COOLDOWN * 1000) return false;
    userLastRequest.set(userId, now);
    return true;
}

async function parseEmotionAndSend(message, text) {
    const emotionPattern = /\{\{(\w+)\}\}/;
    const match = text.match(emotionPattern);
    let mediaUrlToSend = null;
    let textToSend = text;

    if (match) {
        const emotion = match[1].toLowerCase();
        if (EMOTION_URLS[emotion]) {
            mediaUrlToSend = EMOTION_URLS[emotion];
            textToSend = text.replace(emotionPattern, "").trim();
        }
    }

    try {
        if (mediaUrlToSend) {
            const embed = new EmbedBuilder()
                .setImage(mediaUrlToSend)
                .setDescription(textToSend)
                .setColor(0xCD0000)
                .setFooter({ text: "Rias Gremory" });
            return await message.reply({ embeds: [embed] });
        } else {
            return await message.reply({ content: textToSend });
        }
    } catch (e) {
        console.error(`Failed to send media/caption: ${e.message}`);
        return await message.reply({ content: `Error processing message: ${textToSend.substring(0, 100)}...` });
    }
}

// ----------------------------
// Voice Message Handler (FIXED File-Based Logic using Direct Fetch)
// ----------------------------
async function generateAndSendVoiceFile(interaction, textToSpeak, replyTargetMessageId) {
    // Check text length limit
    if (textToSpeak.length > 280) {
        throw new Error('Voice message text must be under 280 characters.');
    }

    // 1. Generate voice with ElevenLabs using direct fetch
    const ELEVENLABS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
    
    const response = await fetch(ELEVENLABS_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
            text: textToSpeak,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.75, similarity_boost: 0.85 },
        }),
    });

    if (!response.ok) {
        // If the API returns a non-200 status, try to read the error message
        const errorText = await response.text().catch(() => 'No response body');
        // The ElevenLabs error is very verbose, only return the relevant start
        const errorDetailMatch = errorText.match(/\"message\":\"(.*?)\"/);
        const errorMessage = errorDetailMatch ? errorDetailMatch[1] : errorText.substring(0, 100);
        
        throw new Error(`ElevenLabs API failed. Status: ${response.status}. Detail: ${errorMessage}...`);
    }

    // Get the audio data as a Buffer
    const audioData = await response.buffer();
    
    // 2. Define filename and write audio data
    const tempFileName = `rias_voice_${interaction.id}.mp3`;
    
    try {
        // Use fs.writeFile from 'fs/promises'
        await fs.writeFile(tempFileName, audioData); 

        // 3. Send the file via message reply
        await interaction.channel.send({
            content: `🎙️ **${interaction.user.tag}** requested Rias Gremory voice:`,
            files: [tempFileName],
            // Use messageReference to reply to the target message (if applicable)
            reply: { messageReference: replyTargetMessageId } 
        });
        
    } catch (e) {
        throw e;
    } finally {
        // 4. Delete the local file
        await fs.unlink(tempFileName).catch(console.error);
    }
}

// ----------------------------
// Scheduler Function
// ----------------------------
async function sendRandomGif() {
    console.log("Starting scheduler...");
    while (true) {
        try {
            const delayMinutes = randomInt(30, 91);
            console.log(`Scheduler will wait ${delayMinutes} minutes.`);
            await setTimeout(delayMinutes * 60 * 1000);
            
            if (!client.readyAt) continue;
            
            const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
            if (!targetChannel || !targetChannel.isTextBased()) continue;
            
            const lastMessages = await targetChannel.messages.fetch({ limit: 1 });
            const lastMessage = lastMessages.first();
            
            if (lastMessage && lastMessage.author.id === client.user.id) continue;
            
            const [mediaUrl, caption] = GIF_URLS_WITH_CAPTIONS[Math.floor(Math.random() * GIF_URLS_WITH_CAPTIONS.length)];
            const embed = new EmbedBuilder()
                .setImage(mediaUrl)
                .setDescription(caption || '')
                .setColor(0xCD0000)
                .setFooter({ text: "Scheduled by Rias Gremory" });
            
            await targetChannel.send({ embeds: [embed] });
            
        } catch (e) {
            console.error(`Scheduler error: ${e.message}`);
            await setTimeout(60_000);
        }
    }
}

// ----------------------------
// AI Response Handler
// ----------------------------
async function processMessageForAi(message) {
    const userId = message.author.id;
    if (!chatMemory.has(userId)) chatMemory.set(userId, []);
    
    const userHistory = chatMemory.get(userId);
    userHistory.push({ role: "user", content: message.content });
    
    const historyToSend = [...userHistory].slice(-MAX_MESSAGES).map(msg => truncateMessage({ ...msg }));
    
    const systemPromptContent = (
        "You are Rias Gremory, a noble and powerful demon from High School DxD. " +
        "Always include an appropriate emotion tag like {{hug}}, {{thinking}}, {{laugh}}, {{surprised}}, etc. " +
        "at the beginning or end of your response."
    );
    
    const messagesToSend = [{ role: "system", content: systemPromptContent }, ...historyToSend];
    
    // Trim history
    let totalCharacters = messagesToSend.reduce((sum, msg) => sum + msg.content.length, 0);
    while (totalCharacters > MAX_CHARACTER_LIMIT && messagesToSend.length > 1) {
        messagesToSend.splice(1, 1);
        totalCharacters = messagesToSend.reduce((sum, msg) => sum + msg.content.length, 0);
    }
    
    try {
        const response = await groqClient.chat.completions.create({
            messages: messagesToSend,
            model: "llama-3.3-70b-versatile",
        });
        
        const replyText = response.choices[0].message.content;
        userHistory.push({ role: "assistant", content: replyText });
        if (userHistory.length > MAX_MESSAGES * 2) userHistory.splice(0, userHistory.length - MAX_MESSAGES * 2);
        
        await parseEmotionAndSend(message, replyText);
    } catch (e) {
        console.error(`Groq API Error: ${e.message}`);
        await message.reply({ content: "Sorry, I couldn't process your request." });
    }
}

// ----------------------------
// Event Listeners
// ----------------------------
client.on('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}!`);
    
    // Define Commands
    const commands = [
        {
            name: 'voice',
            type: ApplicationCommandType.Message, // Context Menu Command (Right-click -> Apps -> Voice)
        },
        {
            name: 'voice',
            description: 'Generate Rias Gremory voice from her message (or your text)',
            options: [
                {
                    name: 'text',
                    description: 'The text for Rias to speak (max 280 characters). Overrides replied message.',
                    type: ApplicationCommandOptionType.String,
                    required: false,
                }
            ]
        },
        {
            name: 'startrias',
            description: 'Start a new conversation with Rias Gremory',
        },
        {
            name: 'memory',
            description: 'Clear your conversation memory with Rias',
        }
    ];
    
    try {
        console.log('Registering slash commands...');
        await client.application.commands.set(commands);
        console.log('Successfully registered slash commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    
    sendRandomGif().catch(console.error);
});

client.on('messageCreate', async message => {
    if (message.author.bot || message.content.startsWith('/')) return;
    
    const isDirectMessage = message.channel.type === 1; 
    const isMentioned = message.mentions.users.has(client.user.id);
    const isReplyToBot = message.reference && message.reference.messageId && 
                             (await message.channel.messages.fetch(message.reference.messageId)).author.id === client.user.id;
    
    if (!isDirectMessage && !isMentioned && !isReplyToBot) return;
    if (!isUserAllowed(message.author.id)) return;
    
    const isMember = await checkGroupMembership(message.author, message.channel);
    if (!isMember) return;
    
    try {
        await processMessageForAi(message);
    } catch (e) {
        console.error(`Error processing message: ${e.message}`);
    }
});

// ----------------------------
// interactionCreate (FIXED DOUBLE-ACKNOWLEDGEMENT AND ADDED GLOBAL CATCH)
// ----------------------------
client.on('interactionCreate', async interaction => {
    // ----------------------------------------------------
    // WRAP ALL COMMAND LOGIC IN A TRY...CATCH BLOCK
    // TO PREVENT BOT CRASHES (The main fix for not receiving answers)
    // ----------------------------------------------------
    try {
        // --- Context Menu Command (Voice) ---
        if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'voice') {
            // Defer reply ephemerally for the context menu interaction
            await interaction.deferReply({ ephemeral: true });

            const isMember = await checkGroupMembership(interaction.user, interaction.channel);
            if (!isMember) {
                // If checkGroupMembership sends an invite, just return;
                // Otherwise, send a basic failure message if deferred
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply("Please join the required server to use my commands.");
                }
                return;
            }

            const messageToSpeak = interaction.targetMessage;
            if (messageToSpeak.author.id !== client.user.id) {
                await interaction.editReply("❌ You can only request voice generation from one of my messages.");
                return;
            }

            const contentToClean = messageToSpeak.embeds[0]?.description || messageToSpeak.content;
            let textToSpeak = cleanText(contentToClean);

            if (!textToSpeak) {
                await interaction.editReply("❌ Could not find text content in the selected message.");
                return;
            }

            if (interaction.user.id !== SPECIAL_USER_ID) {
                const today = new Date().toISOString().split('T')[0];
                const lastUsed = userLastVoiceUsage.get(interaction.user.id);
                if (lastUsed === today) {
                    await interaction.editReply("You can only use the voice command once per day.");
                    return;
                }
            }

            try {
                // Pass the target message ID for the reply reference
                await generateAndSendVoiceFile(interaction, textToSpeak, messageToSpeak.id);
                
                // Mark usage upon success
                if (interaction.user.id !== SPECIAL_USER_ID) {
                    const today = new Date().toISOString().split('T')[0];
                    userLastVoiceUsage.set(interaction.user.id, today);
                }
                
                // 🛑 FIX: Use followUp() or deleteReply() + followUp(). 
                // Using deleteReply() followed by followUp() is the safest pattern for ephemeral deferrals
                await interaction.deleteReply(); 
                await interaction.followUp({ content: `✅ Voice file sent! Check the channel reply.`, ephemeral: true });

            } catch (error) {
                console.error('Voice error:', error);
                await interaction.editReply(`❌ Error: ${error.message || 'Failed to generate voice message.'}`);
            }
            return;
        }

        // --- Slash Commands (/voice, /startrias, /memory) ---
        if (!interaction.isCommand()) return;

        // --- /voice Slash Command ---
        if (interaction.commandName === 'voice') {
            // Defer reply non-ephemerally for the slash command to show "Rias is thinking"
            await interaction.deferReply({ ephemeral: false }); 
            
            const isMember = await checkGroupMembership(interaction.user, interaction.channel);
            if (!isMember) {
                await interaction.editReply({ content: "Please join the required server to use my commands." });
                return;
            }

            let textToSpeak = interaction.options.getString('text');
            let replyTargetMessageId = interaction.id; // Default reply is to the slash command itself

            if (!textToSpeak) {
                // Check for a replied-to message if no 'text' argument was provided
                const repliedMessage = interaction.reference?.messageId 
                    ? await interaction.channel.messages.fetch(interaction.reference.messageId).catch(() => null)
                    : null;
                
                if (!repliedMessage || repliedMessage.author.id !== client.user.id) {
                    await interaction.editReply("❌ Please provide text or reply to one of my messages to generate voice.");
                    return;
                }

                // Get text from the replied message
                const contentToClean = repliedMessage.embeds[0]?.description || repliedMessage.content;
                textToSpeak = cleanText(contentToClean);
                replyTargetMessageId = repliedMessage.id;
            }

            if (!textToSpeak) {
                await interaction.editReply("❌ Could not find text content to speak.");
                return;
            }

            if (textToSpeak.length > 280) {
                await interaction.editReply("❌ Text is too long. Please keep it under 280 characters.");
                return;
            }

            // Daily limit check
            if (interaction.user.id !== SPECIAL_USER_ID) {
                const today = new Date().toISOString().split('T')[0];
                const lastUsed = userLastVoiceUsage.get(interaction.user.id);
                if (lastUsed === today) {
                    await interaction.editReply("You can only use the voice command once per day.");
                    return;
                }
            }
            
            try {
                // Generate and send file, replying to the *target* message
                await generateAndSendVoiceFile(interaction, textToSpeak, replyTargetMessageId);
                
                // Mark usage upon success
                if (interaction.user.id !== SPECIAL_USER_ID) {
                    const today = new Date().toISOString().split('T')[0];
                    userLastVoiceUsage.set(interaction.user.id, today);
                }
                await interaction.deleteReply(); // Clean up the "Rias is thinking" reply
            } catch (error) {
                console.error('Slash Voice error:', error);
                await interaction.editReply(`❌ Error: ${error.message || 'Failed to generate voice message.'}`);
            }
            return;
        }

        // --- /startrias & /memory Slash Commands ---
        if (interaction.commandName === 'startrias' || interaction.commandName === 'memory') {
            chatMemory.delete(interaction.user.id);
            const embed = new EmbedBuilder()
                .setImage(GIF_INTRO_URL)
                .setDescription("Welcome, beloved. I am Rias Gremory. How may I serve you today?")
                .setColor(0xCD0000)
                .setFooter({ text: "President of the Occult Research Club" });
            
            await interaction.reply({ embeds: [embed] });
        }
    } catch (error) {
        // Global catch block for any unhandled errors in interaction processing
        console.error('An unhandled interaction error occurred:', error);
        
        // Attempt to send a private error message if the interaction hasn't timed out or been acknowledged yet.
        // This prevents the fatal crash (40060 error itself).
        if (interaction.replied || interaction.deferred) {
            try {
                // Use followUp if already acknowledged
                await interaction.followUp({ content: '❌ An internal error occurred. I failed, but I did not crash. Please try again.', ephemeral: true });
            } catch (followUpError) {
                console.error('Failed to send follow-up error message:', followUpError);
            }
        } else {
            // Use standard reply if not acknowledged yet
            try {
                await interaction.reply({ content: '❌ An unexpected error occurred. Please try again.', ephemeral: true });
            } catch (replyError) {
                 console.error('Failed to send initial error reply:', replyError);
            }
        }
    }
});

// ----------------------------
// Keep-Alive
// ----------------------------
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Rias Gremory Bot is alive!'));
app.listen(PORT, () => console.log(`Keep-alive server running on port ${PORT}`));

client.login(BOT_API_TOKEN).catch(console.error);
