require("dotenv").config();
const {
  Client,
  IntentsBitField,
  ActivityType,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const fetch = require("node-fetch");

/* =====================================================
                CLIENT / INTENTS
===================================================== */

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

/* =====================================================
                  TWITCH CONFIG
===================================================== */

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_CHANNEL_NAME = process.env.TWITCH_CHANNEL_NAME?.toLowerCase();
const LIVE_ALERT_CHANNEL = process.env.LIVE_ALERT_CHANNEL;

/* =====================================================
                  CARGO DE VERIFICACAO
===================================================== */

const VERIFICATION_ROLE_ID = "1302035443398738050";

/* Estado interno */
let twitchAccessToken = null;
let isLive = false;

/* Guardar respostas do CAPTCHA */
const captchaAnswers = new Map();

/* =====================================================
              OBTER TOKEN DA TWITCH
===================================================== */

async function getTwitchToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );

  const data = await res.json();
  twitchAccessToken = data.access_token;
}

/* =====================================================
              VERIFICAR SE ESTÁ LIVE
===================================================== */

async function checkTwitchLive() {
  if (!TWITCH_CHANNEL_NAME) return;
  if (!twitchAccessToken) await getTwitchToken();

  const res = await fetch(
    `https://api.twitch.tv/helix/streams?user_login=${TWITCH_CHANNEL_NAME}`,
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${twitchAccessToken}`,
      }
    }
  );

  const data = await res.json();
  const stream = data.data && data.data.length > 0;

  if (!isLive && stream) {
    isLive = true;
    sendLiveAnnouncement();
  }

  if (isLive && !stream) {
    isLive = false;
  }
}

/* =====================================================
        ENVIAR AVISO PARA O DISCORD
===================================================== */

async function sendLiveAnnouncement() {
  const channel = client.channels.cache.get(LIVE_ALERT_CHANNEL);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setTitle("🚨 A live começou!")
    .setDescription(`🎥 **${TWITCH_CHANNEL_NAME} está AO VIVO!**\nVem assistir 👉 https://twitch.tv/${TWITCH_CHANNEL_NAME}`)
    .setColor("Red");

  channel.send({ embeds: [embed] });
}

/* =====================================================
                  STATUS ROTATIVO
===================================================== */

const status = [
  { name: "Most Wanted RP", type: ActivityType.Playing },
  { name: "Most Wanted RP", type: ActivityType.Watching },
  { name: "Most Wanted RP melhor RP!", type: ActivityType.Listening },
];

client.on("ready", (c) => {
  console.log(`✅ ${c.user.tag} está online.`);

  setInterval(() => {
    const random = Math.floor(Math.random() * status.length);
    client.user.setActivity(status[random]);
  }, 10000);

  setInterval(checkTwitchLive, 20000);
});

/* =====================================================
        CATEGORIAS DO TICKET
===================================================== */

const categorias = [
  { id: "geral", label: "Assuntos Gerais", desc: "Dúvidas gerais", emoji: "📋" },
  { id: "bug", label: "Reportar BUG", desc: "Bugs e problemas", emoji: "🔧" },
  { id: "jogador", label: "Reportar Jogador", desc: "Denúncia de jogador", emoji: "🚫" },
  { id: "orgilegal", label: "Organização Ilegal", desc: "Assuntos ilegais", emoji: "💀" },
  { id: "orglegal", label: "Organização Legal", desc: "Assuntos legais", emoji: "📂" },
];

/* =====================================================
          FUNÇÃO DO CAPTCHA
===================================================== */

function generateMathCaptcha() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const ops = ["+", "-", "*"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const question = `${a} ${op} ${b}`;

  let answer;
  switch (op) {
    case "+": answer = a + b; break;
    case "-": answer = a - b; break;
    case "*": answer = a * b; break;
  }

  return { question, answer: String(answer) };
}

/* =====================================================
            INTERAÇÕES DO BOT
===================================================== */

client.on("interactionCreate", async (interaction) => {

  /* >>> COMANDO DE TICKET <<< */
  if (interaction.isChatInputCommand() && interaction.commandName === "ticket") {
    const embed = new EmbedBuilder()
      .setTitle("📨 Criar Ticket")
      .setDescription("Escolha a categoria abaixo:")
      .setColor("#2f3136");

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("abrir_ticket")
        .setPlaceholder("Selecionar categoria")
        .addOptions(
          categorias.map(c => ({
            label: c.label,
            value: c.id,
            description: c.desc,
            emoji: c.emoji,
          }))
        )
    );

    return interaction.reply({ embeds: [embed], components: [menu] });
  }

  /* >>> COMANDO /VERIFY <<< */
  if (interaction.isChatInputCommand() && interaction.commandName === "verify") {

    const { question, answer } = generateMathCaptcha();
    const modalId = `captcha_${interaction.user.id}_${Date.now()}`;

    captchaAnswers.set(modalId, { answer, userId: interaction.user.id, guildId: interaction.guild.id });

    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(`Resolva: ${question}`);

    const input = new TextInputBuilder()
      .setCustomId("captcha_answer")
      .setLabel("Qual o resultado?")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Ex: 10")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(input));

    return interaction.showModal(modal);
  }

  /* >>> CRIA TICKET <<< */
  if (interaction.isStringSelectMenu() && interaction.customId === "abrir_ticket") {

    const cat = categorias.find(c => c.id === interaction.values[0]);
    const guild = interaction.guild;
    const user = interaction.user;

    const existing = guild.channels.cache.find(ch => ch.name === `ticket-${user.id}`);
    if (existing)
      return interaction.reply({ content: "⚠️ Você já possui um ticket aberto.", ephemeral: true });

    const canal = await guild.channels.create({
      name: `ticket-${user.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ],
    });

    const embed = new EmbedBuilder()
      .setTitle(`🎫 Ticket - ${cat.label}`)
      .setDescription(`Olá ${user}, explique seu problema:`)
      .addFields({ name: "Categoria", value: cat.label })
      .setColor("#2f3136");

    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("fechar")
        .setLabel("Fechar Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")
    );

    await canal.send({ content: `${user}`, embeds: [embed], components: [closeBtn] });

    return interaction.reply({ content: `🎟️ Ticket criado: ${canal}`, ephemeral: true });
  }

  /* >>> FECHAR TICKET <<< */
  if (interaction.isButton() && interaction.customId === "fechar") {
    await interaction.reply({ content: "🔒 Fechando ticket em 3 segundos...", ephemeral: true });
    setTimeout(() => interaction.channel.delete(), 3000);
  }

  /* >>> RESPOSTA DO CAPTCHA <<< */
  if (interaction.isModalSubmit()) {
    const data = captchaAnswers.get(interaction.customId);
    if (!data) return;

    const userAnswer = interaction.fields.getTextInputValue("captcha_answer").trim();
    captchaAnswers.delete(interaction.customId);

    if (userAnswer === data.answer) {
      try {
        const guild = client.guilds.cache.get(data.guildId);
        const member = await guild.members.fetch(data.userId);

        await member.roles.add(VERIFICATION_ROLE_ID);

        return interaction.reply({ content: "✅ Verificado com sucesso!", ephemeral: true });

      } catch (e) {
        return interaction.reply({ content: "❌ Erro ao atribuir cargo.", ephemeral: true });
      }
    }

    return interaction.reply({ content: "❌ Resposta incorreta. Use /verify novamente.", ephemeral: true });
  }
});

/* =====================================================
            DM QUANDO ENTRA NO SERVIDOR
===================================================== */

client.on("guildMemberAdd", async (member) => {
  try {
    await member.send(
      `Bem-vindo(a) ${member.user.username}!\nPara desbloquear o servidor, digite **/verify** e resolva o CAPTCHA.`
    );
  } catch {
    console.log(`❗ Não foi possível enviar DM para ${member.user.tag}`);
  }
});

/* =====================================================
     COMANDO TEXTO: !mensagem <conteúdo>
===================================================== */

client.on("messageCreate", (message) => {
  if (!message.content.startsWith("!mensagem")) return;
  if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator))
    return message.reply("❌ Apenas administradores podem usar este comando.");

  const texto = message.content.replace("!mensagem", "").trim();
  if (!texto) return message.reply("⚠️ Escreve a mensagem: `!mensagem <texto>`");

  message.channel.send(texto);
});

/* =====================================================
                  LOGIN
===================================================== */

client.login(process.env.TOKEN);