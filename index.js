import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';
import { Groq } from 'groq-sdk';
import express from 'express';
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  entersState,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
} from '@discordjs/voice';
import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';
import { setTimeout } from 'timers/promises';
import { randomInt } from 'crypto';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ----------------------------
// API Tokens & Constants
// ----------------------------
// These must be set as environment variables in Render.com
const BOT_API_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Validate required environment variables
if (!BOT_API_TOKEN) {
  console.error('❌ Missing required environment variable: DISCORD_BOT_TOKEN');
  process.exit(1);
}
if (!GROQ_API_KEY) {
  console.error('❌ Missing required environment variable: GROQ_API_KEY');
  process.exit(1);
}
if (!ELEVENLABS_API_KEY) {
  console.error('❌ Missing required environment variable: ELEVENLABS_API_KEY');
  process.exit(1);
}

const ELEVENLABS_VOICE_ID = 'cgSgspJ2msm6clMCkdW9';

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
const elevenLabsClient = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
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
// Media URLs (DIRECT LINKS)
// ----------------------------
// These are direct media URLs that Discord can embed
const GIF_URLS_WITH_CAPTIONS = [
  ['https://i.imgur.com/QvXVd8Y.gif', ''],
  ['https://i.imgur.com/l5M0XeB.gif', ''],
  ['https://i.imgur.com/JkFj7qP.gif', 'Hmm. This changes things...'],
  ['https://i.imgur.com/9HwQhXr.gif', ''],
  ['https://i.imgur.com/5QcFZ4K.gif', 'Don\'t get ideas…']
];

const GIF_INTRO_URL = 'https://i.imgur.com/fRiasIntro.gif'; // Replace with actual intro GIF URL

const rias_responses = [
  "As the President of the Occult Research Club, I must say, you're quite intriguing.",
  "I value loyalty above all else. Will you stand by my side?",
  "Even in the most dangerous situations, I stay composed and ready to fight.",
  "There's more to me than just my looks. I'm a powerful demon, after all.",
  "Shall we continue this adventure together?"
];

// ----------------------------
// Emotion URLs (DIRECT IMAGE LINKS)
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
    return {
      ...message,
      content: message.content.substring(0, maxLength) + "..."
    };
  }
  return message;
}

function cleanText(text) {
  return text.replace(/\*.*?\*/g, "").trim();
}

async function checkGroupMembership(user, channel) {
  if (user.id === SPECIAL_USER_ID) {
    return true;
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    if (!guild) {
      console.error(`Guild with ID ${GUILD_ID} not found.`);
      await channel.send("I couldn't verify your membership. Please try again later.");
      return false;
    }

    const member = await guild.members.fetch(user.id).catch(() => null);

    if (member) {
      return true;
    } else {
      const inviteUrl = 'https://discord.gg/bxSnZQBsdf'; // Replace with your actual invite

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('✅ Join @squad13girls')
          .setURL(inviteUrl)
          .setStyle(ButtonStyle.Link)
      );

      await channel.send({
        content: "To use me, join **@squad13girls** first!",
        components: [row]
      });
      return false;
    }
  } catch (e) {
    console.error(`Discord Guild check failed: ${e.message}`);
    await channel.send("I couldn't verify your membership. Please try again later.");
    return false;
  }
}

function isUserAllowed(userId) {
  if (userId === SPECIAL_USER_ID) return true;
  
  const now = Date.now();
  const last = userLastRequest.get(userId) || 0;
  
  if (now - last < MESSAGE_COOLDOWN * 1000) {
    return false;
  }
  
  userLastRequest.set(userId, now);
  return true;
}

function parseEmotionAndSend(message, text) {
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

      return message.reply({ embeds: [embed] });
    } else {
      return message.reply({ content: textToSend });
    }
  } catch (e) {
    console.error(`Failed to send media/caption: ${e.message}`);
    return message.reply({ content: `Error processing message: ${textToSend.substring(0, 100)}...` });
  }
}

// ----------------------------
// Voice Message Handler
// ----------------------------
async function generateAndPlayVoice(interaction, textToSpeak) {
  const member = interaction.member;
  const voiceChannel = member?.voice?.channel;
  
  if (!voiceChannel) {
    throw new Error('You must be in a voice channel to use this command!');
  }
  
  // Check user permissions to connect to the voice channel
  const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
  if (!permissions.has(PermissionsBitField.Flags.Connect) || 
      !permissions.has(PermissionsBitField.Flags.Speak)) {
    throw new Error('I don\'t have permission to connect or speak in your voice channel!');
  }
  
  let connection;
  let player;
  
  try {
    // Connect to voice channel
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });
    
    // Wait for connection to be ready
    await Promise.race([
      entersState(connection, VoiceConnectionStatus.Ready, 15_000),
      new Promise((_, reject) => 
        setTimeout(15_000).then(() => reject(new Error('Failed to connect to voice channel within 15 seconds')))
      )
    ]);
    
    // Generate voice with ElevenLabs
    const audioStream = await elevenLabsClient.textToSpeech.convertAsStream(ELEVENLABS_VOICE_ID, {
      text: textToSpeak,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.75,
        similarity_boost: 0.85,
      }
    });
        
    // Create audio player and resource
    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      }
    });
    
    // Create resource from audio stream
    const audioResource = createAudioResource(Readable.from(audioStream), {
      inputType: 'webm/opus',
      inlineVolume: true,
    });
    
    // Connect player to the voice connection
    connection.subscribe(player);
    player.play(audioResource);
    
    // Wait for playback to finish or timeout after 30 seconds
    await Promise.race([
      entersState(player, AudioPlayerStatus.Idle, 30_000),
      new Promise((_, reject) => 
        setTimeout(30_000).then(() => {
          player.stop();
          reject(new Error('Audio playback timed out after 30 seconds'));
        })
      )
    ]);
    
    return true;
  } catch (error) {
    console.error('Voice generation/playback error:', error);
    throw error;
  } finally {
    // Clean up connection and player
    if (player) {
      player.stop();
    }
    if (connection) {
      connection.destroy();
    }
  }
}

// ----------------------------
// Scheduler Function
// ----------------------------
async function sendRandomGif() {
  console.log("Starting scheduler...");

  while (true) {
    try {
      // Random delay between 30-90 minutes
      const delayMinutes = randomInt(30, 91);
      console.log(`Scheduler will wait ${delayMinutes} minutes before next post.`);
      await setTimeout(delayMinutes * 60 * 1000);
      
      // Only run if client is ready
      if (!client.readyAt) {
        console.log("Client not ready yet, skipping scheduled post.");
        continue;
      }
      
      const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(e => {
        console.error(`Could not fetch target channel: ${e.message}`);
        return null;
      });
      
      if (!targetChannel || !targetChannel.isTextBased()) {
        console.error(`Target channel ${TARGET_CHANNEL_ID} not found or not a text channel.`);
        continue;
      }
      
      // Get last message to avoid consecutive bot messages
      const lastMessages = await targetChannel.messages.fetch({ limit: 1 });
      const lastMessage = lastMessages.first();
      
      if (lastMessage && lastMessage.author.id === client.user.id) {
        console.log("Last message was from bot, skipping scheduled post.");
        continue;
      }
      
      // Select random GIF with caption
      const [mediaUrl, caption] = GIF_URLS_WITH_CAPTIONS[Math.floor(Math.random() * GIF_URLS_WITH_CAPTIONS.length)];
      
      const embed = new EmbedBuilder()
        .setImage(mediaUrl)
        .setDescription(caption || '')
        .setColor(0xCD0000)
        .setFooter({ text: "Scheduled by Rias Gremory" });
      
      await targetChannel.send({ embeds: [embed] });
      console.log(`Sent scheduled media: ${mediaUrl}`);
      
    } catch (e) {
      console.error(`Error in scheduler: ${e.message}`);
      // Wait a bit before retrying after an error
      await setTimeout(60_000);
    }
  }
}

// ----------------------------
// AI Response Handler
// ----------------------------
async function processMessageForAi(message) {
  const userId = message.author.id;
  const userText = message.content;
  
  console.log(`Processing message from ${message.author.tag}: ${userText}`);
  
  // Initialize user memory if needed
  if (!chatMemory.has(userId)) {
    chatMemory.set(userId, []);
  }
  
  const userHistory = chatMemory.get(userId);
  
  // Add user message to history
  userHistory.push({ role: "user", content: userText });
  
  // Prepare messages to send to Groq
  const historyToSend = [...userHistory]
    .slice(-MAX_MESSAGES)
    .map(msg => truncateMessage({ ...msg }));
  
  const systemPromptContent = (
    "You are Rias Gremory, a noble and powerful demon from High School DxD. " +
    "You are knowledgeable, confident, and protective of those you care about. " +
    "**Always** include an appropriate emotion tag like {{hug}}, {{thinking}}, {{laugh}}, {{surprised}}, etc., " +
    "**at the beginning or end of your response** if it expresses any distinct feeling, reaction, or action. " +
    "Examples of available emotions include: {{smirk}}, {{laugh}}, {{wink}}, {{hug}}, " +
    "{{confident_smirk}}, {{sly_glance}}, {{teasing_whisper}}, {{gift_pause}}, " +
    "{{quiet_pride}}, {{fond_exasperation}}, {{playful_tease}}, {{romantic_gaze}}, " +
    "{{mysterious_smile}}, {{peerage_leader_mode}}, {{silent_agreement}}, {{gentle_nudge}}, " +
    "{{thinking}}, {{curious}}, {{surprised}}, {{listening_attentive}}, {{calm_assurance}}, " +
    "{{joyful_laugh}}, {{reflective_quiet}}, {{supportive_comfort}}, {{mischievous_smirk}}, " +
    "{{blushing}}, {{annoyed}}, {{confused}}, {{happy}}, {{shocked}}, {{skeptical}}, " +
    "{{nervous}}, {{pleased}}, {{calm}}, {{disappointed}}, {{configcfg}}. " +
    "Choose the tag that best matches the tone. Keep responses short and elegant. " +
    "Do not repeat the same emotion consecutively unless context strongly dictates it."
  );
  
  const messagesToSend = [
    { role: "system", content: systemPromptContent },
    ...historyToSend
  ];
  
  // Trim history if over character limit
  let totalCharacters = messagesToSend.reduce((sum, msg) => sum + msg.content.length, 0);
  let trimmedCount = 0;
  
  while (totalCharacters > MAX_CHARACTER_LIMIT && messagesToSend.length > 1) {
    // Remove the oldest history item (index 1, as index 0 is the system prompt)
    messagesToSend.splice(1, 1);
    totalCharacters = messagesToSend.reduce((sum, msg) => sum + msg.content.length, 0);
    trimmedCount++;
  }
  
  if (trimmedCount > 0) {
    console.log(`Trimmed ${trimmedCount} messages from history for user ${userId}. New total chars: ${totalCharacters}`);
  }
  
  // Call Groq API
  try {
    const response = await groqClient.chat.completions.create({
      messages: messagesToSend,
      model: "llama-3.3-70b-versatile",
    });
    
    const replyText = response.choices[0].message.content;
    console.log(`AI response for ${userId}: ${replyText}`);
    
    // Add AI response to memory
    userHistory.push({ role: "assistant", content: replyText });
    
    // Keep memory within limits
    if (userHistory.length > MAX_MESSAGES * 2) {
      userHistory.splice(0, userHistory.length - MAX_MESSAGES * 2);
    }
    
    // Send the response
    await parseEmotionAndSend(message, replyText);
    
  } catch (e) {
    console.error(`Groq API Error for user ${userId}: ${e.message}`);
    await message.reply({
      content: "Sorry, I couldn't process your request at the moment. Please try again later."
    });
  }
}

// ----------------------------
// Event Listeners
// ----------------------------
client.on('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  
  // Register slash commands
  const commands = [
    {
      name: 'voice',
      description: 'Generate Rias Gremory voice from your text',
      options: [
        {
          name: 'text',
          description: 'Text for Rias to speak (max 280 characters)',
          type: 3, // STRING
          required: false, // MAKE TEXT OPTIONAL
        },
        {
          name: 'reply',
          description: 'Set to true to use the text from the message you replied to.',
          type: 5, // BOOLEAN
          required: false,
        }
      ],
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
  
  // Start the scheduler
  sendRandomGif().catch(console.error);
});

client.on('messageCreate', async message => {
  // Ignore bots and messages starting with slash (commands)
  if (message.author.bot || message.content.startsWith('/')) {
    return;
  }
  
  // Determine if we should process this message:
  // 1. Direct messages
  // 2. Messages where the bot is mentioned
  // 3. Replies to the bot
  const isDirectMessage = message.channel.type === 1; // DM channel type
  const isMentioned = message.mentions.users.has(client.user.id);
  const isReplyToBot = message.reference && 
                      message.reference.messageId && 
                      (await message.channel.messages.fetch(message.reference.messageId))
                        .author.id === client.user.id;
  
  const shouldProcess = isDirectMessage || isMentioned || isReplyToBot;
  
  if (!shouldProcess) {
    return;
  }
  
  // Check user rate limiting
  if (!isUserAllowed(message.author.id)) {
    if (message.channel.type !== 1) { // Only respond in DMs if rate limited
      await message.reply({
        content: "Please wait a few seconds before sending another message.",
        ephemeral: true
      });
    }
    return;
  }
  
  // Check group membership for non-special users
  const isMember = await checkGroupMembership(message.author, message.channel);
  if (!isMember) {
    return;
  }
  
  // Process the message with AI
  try {
    await processMessageForAi(message);
  } catch (e) {
    console.error(`Error processing message: ${e.message}`);
    await message.reply({
      content: "I encountered an error while processing your message. Please try again later."
    });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;
  
  // Check group membership first
  const isMember = await checkGroupMembership(interaction.user, interaction.channel);
  if (!isMember) {
    await interaction.reply({ 
      content: "Please join the required server to use my commands.", 
      ephemeral: true 
    });
    return;
  }
  
  if (interaction.commandName === 'startrias' || interaction.commandName === 'memory') {
    // Clear user memory
    chatMemory.delete(interaction.user.id);
    
    // Send intro with media
    const embed = new EmbedBuilder()
      .setImage(GIF_INTRO_URL)
      .setDescription("Welcome, beloved. I am Rias Gremory, the Crimson-Haired Ruin Princess. How may I serve you today?")
      .setColor(0xCD0000)
      .setFooter({ text: "President of the Occult Research Club" });
    
    await interaction.reply({ 
      embeds: [embed],
      ephemeral: true
    });
    
  } else if (interaction.commandName === 'voice') {
      await interaction.deferReply({ ephemeral: true });
  
      // 1. 🛑 FIX: Check if the user is in a Voice Channel and in a Guild
      if (!interaction.guild || !interaction.member || !interaction.member.voice.channel) {
          await interaction.editReply("❌ To use the voice command, you must be in a voice channel within a server.");
          return;
      }
  
      // 2. 🛑 FIX: Check daily voice usage limit (Moved here for better performance)
      if (interaction.user.id !== SPECIAL_USER_ID) {
          const today = new Date().toISOString().split('T')[0];
          const lastUsed = userLastVoiceUsage.get(interaction.user.id);
  
          if (lastUsed === today) {
              await interaction.editReply("You can only use the voice command once per day. Try again tomorrow.");
              return;
          }
      }
      
      // --- Existing Reply/Text Logic (You did this correctly) ---
      let textToSpeak = interaction.options.getString('text');
      const useReply = interaction.options.getBoolean('reply') || false;
  
      if (useReply && interaction.reference?.messageId) {
          try {
              const repliedMessage = await interaction.channel.messages.fetch(interaction.reference.messageId);
              // Use the description of the embed if it's the bot's message (which holds the AI text)
              if (repliedMessage.author.id === client.user.id) {
                  // We prioritize the embed description (AI response) or fall back to plain content
                  const contentToClean = repliedMessage.embeds[0]?.description || repliedMessage.content;
                  // Remove the emotion tag and cleanup
                  textToSpeak = cleanText(contentToClean);
              } else {
                  await interaction.editReply("❌ Error: You must reply to one of my messages to use the 'reply' option.");
                  return;
              }
          } catch (e) {
              console.error('Failed to fetch replied message:', e);
              await interaction.editReply("❌ Error fetching the message you replied to.");
              return;
          }
      } else if (!textToSpeak) {
          // If neither text nor reply was provided
          await interaction.editReply("Please provide text using the `text` option, or reply to one of my messages and set `reply` to true.");
          return;
      }
      
      // Check text length
      if (textToSpeak.length > 280) {
          await interaction.editReply("Please keep the text under 280 characters for voice messages.");
          return;
      }
  
      // Generate and play voice
      try {
          await generateAndPlayVoice(interaction, textToSpeak);
  
          // Update usage tracking (Only if voice generation was successful)
          if (interaction.user.id !== SPECIAL_USER_ID) {
              const today = new Date().toISOString().split('T')[0];
              userLastVoiceUsage.set(interaction.user.id, today);
          }
  
          await interaction.editReply(`🎙️ Voice message played successfully in your voice channel!`);
      } catch (error) {
          console.error('Voice command error:', error);
          await interaction.editReply(`❌ Error: ${error.message || 'Failed to generate/play voice message.'}`);
      }
  }
});

// ----------------------------
// Keep-Alive & Start Bot
// ----------------------------
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => {
  res.send(`Rias Gremory Bot is alive! Uptime: ${process.uptime()} seconds`);
});

app.listen(PORT, () => {
  console.log(`Keep-alive server running on port ${PORT}`);
});

// Login to Discord
client.login(BOT_API_TOKEN).catch(console.error);
