const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const db = require('../database.js');
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 25;
const TIME_TO_START = 30000;
const TIME_TO_HIDE = 20000;
const TIME_TO_SEEK = 20000;
const SPOT_COUNT = 25;

let GAME_ACTIVE = false;
let players = [];
let spots = new Map();
let checkedSpotState = new Map();

module.exports = {
  name: 'hide',
  aliases: ["غميضة"],
  execute(message, args, callback) {
    if (GAME_ACTIVE) {
      message.reply(`> **❌ | لقد بدأت لعبة أخرى بالفعل. الرجاء الانتظار حتى انتهاء اللعبة الحالية.**`);
      callback();
      return;
    }

    GAME_ACTIVE = true;
    const nowTime = Math.floor(Date.now() / 1000);
    startGame(message, nowTime, callback);
  }
};

function resetGameData() {
  GAME_ACTIVE = false;
  players = [];
  spots.clear();
  checkedSpotState.clear();
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function getRandomWinPoints() {
    const min = 5;
    const max = 5;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function win(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
    console.log(`[Hide] Gave ${points} points to winner ${playerId}`);
  } catch (e) {
    console.error(`[Hide] Failed to apply win points: ${e}`)
  }
}

async function lose(playerId, context) {}

async function startGame(context, nowTime, callback) {
  players = [];
  spots.clear();
  checkedSpotState.clear();

  const lobbyEmbed = new EmbedBuilder()
    .setTitle("🫣 | لعبة الغميضة")
    .setDescription(`> **الوقت المتبقي لبدأ اللعبة: <t:${nowTime + TIME_TO_START / 1000}:R>**`)
    .addFields({ name: `اللاعبين الحاليين (0 / ${MAX_PLAYERS})`, value: "لا يوجد لاعبين بعد..." })
    .setColor("#5865F2")
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("join")
      .setEmoji("<:GPlay:1285562004873936979>")
      .setLabel("دخول")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("exit")
      .setEmoji("<:Gleave:1285563197092401214>")
      .setLabel("خروج")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("explain")
      .setEmoji("<:GBook:1285560569021202504>")
      .setLabel("شرح اللعبة")
      .setStyle(ButtonStyle.Secondary)
  );

  const sentMessage = await context.reply({
    embeds: [lobbyEmbed],
    components: [row],
    fetchReply: true,
  });

  const filter = (i) => i.customId === "join" || i.customId === "exit" || i.customId === "explain";
  const collector = sentMessage.createMessageComponentCollector({
    filter,
    time: TIME_TO_START,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "join") {
      if (players.length < MAX_PLAYERS) {
        const playerExists = players.some((p) => p.id === i.user.id);
        if (!playerExists) {
          players.push({
            id: i.user.id,
            displayName: i.user.displayName,
            avatarURL: i.user.displayAvatarURL({ extension: "png", forceStatic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png",
          });
          await updateLobbyMessage(sentMessage, players, nowTime);
          await i.reply({ content: `لقد انضممت إلى اللعبة! 🎉`, ephemeral: true });
        } else {
          await i.reply({ content: `أنت بالفعل في اللعبة! 🚫`, ephemeral: true });
        }
      } else {
        await i.reply({ content: `اللعبة ممتلئة! 🚪`, ephemeral: true });
      }
    } else if (i.customId === "exit") {
      const playerExists = players.some((p) => p.id === i.user.id);
      if (playerExists) {
        players = players.filter((p) => p.id !== i.user.id);
        await updateLobbyMessage(sentMessage, players, nowTime);
        await i.reply({ content: `لقد غادرت اللعبة. 👋`, ephemeral: true });
      } else {
        await i.reply({ content: `لم تكن في اللعبة. ❓`, ephemeral: true });
      }
    } else if (i.customId === "explain") {
      const explainEmbed = new EmbedBuilder()
        .setTitle("🫣 | شرح لعبة الغميضة")
        .setColor("#5865F2")
        .setDescription(
`### **🃏・كيفية المشاركة:**
> 1. اضغط على زر "دخول" للمشاركة وزر "خروج" للمغادرة.
> 2. ستبدأ اللعبة بعد <t:${nowTime + TIME_TO_START / 1000}:R>.

### **📘・كيفية اللعب:**
> 1. عند بدء اللعبة ستظهر 25 زراً ويجب عليك الاختباء في مكان واحد.
> 2. في كل جولة، سيتم اختيار لاعب عشوائي (الباحث) للبحث عن الآخرين.
> 3. يختار الباحث مكاناً واحداً. إن كان به لاعبون، يتم طردهم. (الباحث لا يتم طرده إذا كان في نفس المكان)
> 4. اللاعبون الذين لا يختبئون أو الباحث الذي لا يختار مكاناً في الوقت المحدد يتم طردهم.
> 5. تنتهي اللعبة عندما يبقى شخص واحد.`
        );
      await i.reply({ embeds: [explainEmbed], ephemeral: true });
    }
  });

  collector.on("end", async () => {
    try {
      row.components.forEach(button => button.setDisabled(true));
      const endEmbed = EmbedBuilder.from(lobbyEmbed)
          .setDescription("**انتهى وقت الانضمام للعبة!**")
          .setFields({
              name: `اللاعبين المشاركين (${players.length} / ${MAX_PLAYERS})`,
              value: players.length > 0 ? players.map((p) => `<@${p.id}>`).join(", ") : "لا يوجد"
          });
      await sentMessage.edit({ embeds: [endEmbed], components: [row] });
    } catch (error) {
      console.error("Failed to disable join buttons:", error);
    }

    if (players.length < MIN_PLAYERS) {
      await context.channel.send(`لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة. 🚪`);
      resetGameData();
      callback();
      return;
    } else {
      await context.channel.send(`👥 | اكتمل عدد اللاعبين! اللعبة ستبدأ الآن...`);
      await startHidingPhase(context, callback);
    }
  });
}

async function updateLobbyMessage(sentMessage, players, nowTime) {
    const playerList = players.length > 0
        ? players.map((p) => `<@${p.id}>`).join(", ")
        : "لا يوجد لاعبين بعد...";

    const updatedEmbed = new EmbedBuilder()
        .setTitle("🫣 | لعبة الغميضة")
        .setDescription(`> **الوقت المتبقي لبدأ اللعبة: <t:${nowTime + TIME_TO_START / 1000}:R>**`)
        .setFields({ name: `اللاعبين الحاليين (${players.length} / ${MAX_PLAYERS})`, value: playerList })
        .setColor("#5865F2")
        .setTimestamp();

    await sentMessage.edit({ embeds: [updatedEmbed] });
}

async function startHidingPhase(context, callback) {
  let hiddenPlayers = new Set();
  spots.clear();

  const rows = generateHidingButtons();
  const hideMessage = await context.channel.send({
      content: `### اختر مكاناً للاختباء خلال ${TIME_TO_HIDE / 1000} ثانية!`,
      components: rows
  });

  const filter = (i) => i.customId.startsWith('hide_') && players.some(p => p.id === i.user.id);
  const collector = hideMessage.createMessageComponentCollector({
      filter,
      time: TIME_TO_HIDE
  });

  collector.on('collect', async (i) => {
      if (hiddenPlayers.has(i.user.id)) {
          await i.reply({ content: 'لقد اختبأت بالفعل!', ephemeral: true });
          return;
      }

      hiddenPlayers.add(i.user.id);
      const spotId = i.customId;
      const spotNumber = parseInt(spotId.split('_')[1]) + 1;

      if (!spots.has(spotId)) spots.set(spotId, []);
      spots.get(spotId).push(i.user.id);

      await i.reply({ content: `🫣 | لقد اختبأت بنجاح في المكان ${spotNumber}!`, ephemeral: true });
  });

  collector.on('end', async () => {
      rows.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
      await hideMessage.edit({ components: rows });

      const notHidden = players.filter(p => !hiddenPlayers.has(p.id));
      if (notHidden.length > 0) {
          await context.channel.send(`🏃 | تم طرد ${notHidden.map(p => `<@${p.id}>`).join(', ')} لعدم الاختباء!`);
          players = players.filter(p => hiddenPlayers.has(p.id));
      }

      if (await checkWin(context, callback)) return;

      await context.channel.send('🕵️ | انتهى وقت الاختباء! ستبدأ جولة البحث الأولى...');
      await sleep(3000);
      await startSeekingPhase(context, callback);
  });
}

async function startSeekingPhase(context, callback) {
  if (await checkWin(context, callback)) return;

  const seeker = players[Math.floor(Math.random() * players.length)];
  const rows = generateSeekingButtons();

  const seekMessage = await context.channel.send({
      content: `🕵️ | دور <@${seeker.id}> للبحث! لديك ${TIME_TO_SEEK / 1000} ثانية لاختيار مكان.`,
      components: rows
  });

  const filter = (i) => i.customId.startsWith('hide_') && i.user.id === seeker.id;
  const collector = seekMessage.createMessageComponentCollector({
      filter,
      time: TIME_TO_SEEK,
      max: 1
  });

  let choiceMade = false;

  collector.on('collect', async (i) => {
      choiceMade = true;
      const chosenSpotId = i.customId;
      checkedSpotState.set(chosenSpotId, 'pending');

      const foundPlayers = spots.get(chosenSpotId) || [];

      const eliminatedPlayers = foundPlayers.filter(id => id !== seeker.id);

      const disabledRows = generateSeekingButtons();
      disabledRows.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
      await seekMessage.edit({ components: disabledRows });

      if (eliminatedPlayers.length > 0) {
          checkedSpotState.set(chosenSpotId, 'correct');
          await context.channel.send(`💥 | <@${seeker.id}> وجد ${eliminatedPlayers.map(id => `<@${id}>`).join(', ')}! لقد تم طردهم.`);

          players = players.filter(p => !eliminatedPlayers.includes(p.id));

          const spotSurvivors = foundPlayers.filter(id => id === seeker.id);
          spots.set(chosenSpotId, spotSurvivors);
      } else {
          checkedSpotState.set(chosenSpotId, 'wrong');

          if (foundPlayers.length > 0 && eliminatedPlayers.length === 0) {
              await context.channel.send(`💨 | <@${seeker.id}> فحص مكانه... ولكنه هو فقط من كان هناك!`);
          } else {
              await context.channel.send(`💨 | <@${seeker.id}> فحص المكان... ولم يجد أحدًا!`);
          }
      }
  });

  collector.on('end', async () => {
      if (!choiceMade) {
          const disabledRows = generateSeekingButtons();
          disabledRows.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
          try {
            await seekMessage.edit({ components: disabledRows });
          } catch (e) { /* message might be deleted, ignore */ }
      }

      if (!choiceMade) {
          await context.channel.send(`⏳ | <@${seeker.id}> لم يختر مكاناً في الوقت المحدد وتم طرده!`);
          players = players.filter(p => p.id !== seeker.id);
      }

      if (await checkWin(context, callback)) return;

      await context.channel.send('--- 🫣 جولة جديدة تبدأ 🫣 ---');
      await sleep(3000);
      await startSeekingPhase(context, callback);
  });
}

function generateHidingButtons() {
    let rows = [];
    for (let r = 0; r < 5; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 5; c++) {
            const index = r * 5 + c;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`hide_${index}`)
                    .setEmoji('▫️')
                    .setStyle(ButtonStyle.Secondary)
            );
        }
        rows.push(row);
    }
    return rows;
}

function generateSeekingButtons() {
    let rows = [];
    for (let r = 0; r < 5; r++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < 5; c++) {
            const index = r * 5 + c;
            const spotId = `hide_${index}`;
            const state = checkedSpotState.get(spotId);

            const button = new ButtonBuilder()
                .setCustomId(spotId)
                .setStyle(ButtonStyle.Secondary);

            if (state === 'correct') {
                button.setEmoji('\<:snipe:1434599678837657671>').setDisabled(true);
            } else if (state === 'wrong') {
                button.setEmoji('\<:no_seeker:1434599725100830853>').setDisabled(true);
            } else {
                button.setEmoji('▫️').setDisabled(false);
            }
            row.addComponents(button);
        }
        rows.push(row);
    }
    return rows;
}

async function checkWin(context, callback) {
  if (players.length === 1) {
    const winner = players[0];
    try {
        const winnerImage = await createWinnerImage(winner);
        await context.channel.send({
            content: `🏆 | <@${winner.id}> هو آخر الناجين وهو الفائز!`,
            files: [winnerImage]
        });
    } catch (e) {
        console.error("Failed to create winner image:", e);
        await context.channel.send(`🏆 | <@${winner.id}> هو آخر الناجين وهو الفائز!`);
    }

    await win(winner.id, context);
    resetGameData();
    callback();
    return true;

  } else if (players.length === 0) {
    await context.channel.send("☠️ | تم طرد جميع اللاعبين! لا يوجد فائز هذه الجولة.");
    resetGameData();
    callback();
    return true;
  }
  return false;
}

async function createWinnerImage(winner) {
  const canvas = createCanvas(800, 300);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#2C2F33";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "60px Arial";
  ctx.textAlign = "center";
  ctx.fillText("الفائز", canvas.width / 2, 100);

  let avatar;
  try {
    avatar = await loadImage(winner.avatarURL);
  } catch (e) {
    avatar = await loadImage("https://cdn.discordapp.com/embed/avatars/0.png");
  }

  const avatarSize = 100;
  const avatarX = canvas.width / 2 - avatarSize / 2;
  const avatarY = 120;
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = "40px Arial";
  ctx.fillText(winner.displayName, canvas.width / 2, 260);

  return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "winner.png" });
}
