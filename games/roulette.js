const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");

const db = require("../database.js"); 

const { createCanvas, loadImage } = require("canvas");
const path = require("path");


const MIN_PLAYERS = 3;
const MAX_PLAYERS = 20;
const TIME_TO_START = 40000; 
const COLOR = "#d4be78";
const emojis = [
  "1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟",
  "<:GEleven:1285946860951044128>","<:GTwelve:1285946918383386674>",
  "<:GThirteen:1285946956157423671>","<:GFourteen:1285947007910940805>",
  "<:GFifteen:1285947059454611528>","<:GSixteen:1285947087938257020>",
  "<:GSeventeen:1285947127679422508>","<:GEighteen:1285947168305320000>",
  "<:GNineteen:1285947288744759307>","<:GTwenty:1285947320508350558>",
];


let CURRENTLY_SENDING_IMAGE = false;
let LAST_SELECTED_PLAYER_ID = null;
let LAST_ROUND_TIME = 0;
let ROUND_COUNTER = 0;

function resetGameData() {
  CURRENTLY_SENDING_IMAGE = false;
  LAST_SELECTED_PLAYER_ID = null;
  LAST_ROUND_TIME = 0;
  ROUND_COUNTER = 0;
}

module.exports = {
  name: "roulette",
  aliases: ["روليت", "r"],
    execute(message, args, callback) {
    const nowTime = Math.floor(Date.now() / 1000);
    startGame(message, nowTime, callback);
  },
};


function clampLabel(s, max = 80) {
  if (!s) return "";
  s = String(s);
  return s.length > max ? s.slice(0, max - 2) + ".." : s;
}
async function startGame(context, nowTime, callback) {
  const players = [];
  let lobbyEmbed = new EmbedBuilder()
    .setTitle("🎲 | لعبة روليت")
    .setDescription(
      `> **الوقت المتبقي لبدأ اللعبة: <t:${
        nowTime + TIME_TO_START / 1000
      }:R>**\n\n> **اللاعبين الحاليين (0 / ${MAX_PLAYERS})**`
    )
    .setColor(COLOR)
    .setFooter({ text: "اضغط على رقم لاحتلاله أو استخدم دخول عشوائي" });
    
  function buildInitialRows() {
    const rows = [];
    for (let i = 0; i < 4; i++) {
      const row = new ActionRowBuilder();
      for (let j = 0; j < 5; j++) {
        const index = i * 5 + j;
        if (index < emojis.length) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`place_${index}`)
              .setEmoji(emojis[index] || "🔲")
              .setLabel("\u200B")
              .setStyle(ButtonStyle.Secondary)
          );
        }
      }
      rows.push(row);
    }

    const extraRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("join")
        .setLabel("دخول عشوائي")
        .setEmoji("🎲")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("exit")
        .setEmoji("<:Gleave:1285563197092401214>") 
        .setLabel("خروج")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId("explain")
        .setEmoji("<:GBook:1285560569021202504>") 
        .setLabel("شرح اللعبة ")
        .setStyle(ButtonStyle.Secondary)
    );
    rows.push(extraRow);
    return rows;
  }

  const rows = buildInitialRows();

  
  const sentMessage = await context.reply({
    embeds: [lobbyEmbed],
    components: rows,
    fetchReply: true,
  });

  
  async function updateLobbyView() {
    
    const sorted = [...players].sort((a, b) => a.index - b.index);
    const playerListText =
      sorted.length > 0
        ? sorted
            .map((p) => `> ${emojis[p.index]} : <@${p.id}>`)
            .join("\n")
        : "> لا يوجد لاعبين بعد";
    lobbyEmbed = EmbedBuilder.from(lobbyEmbed).setDescription(
      `> **الوقت المتبقي لبدء اللعبة: <t:${
        nowTime + TIME_TO_START / 1000
      }:R>**\n\n> **اللاعبين الحاليين (${
        players.length
      } / ${MAX_PLAYERS}) :**\n${playerListText}`
    );

    
    const newRows = rows.map((row) => {
      const components = row.components.map((button) => {
        try {
          if (
            button &&
            typeof button.customId === "string" &&
            button.customId.startsWith("place_")
          ) {
            const idx = parseInt(button.customId.split("_")[1]);
            const p = players.find((pl) => pl.index === idx);

            if (p) {
              
              return ButtonBuilder.from(button)
                .setDisabled(true)
                .setLabel(clampLabel(p.username, 80));
            } else {
              
              return ButtonBuilder.from(button)
                .setDisabled(false)
                .setLabel("\u200B"); 
            }
          }
        } catch (e) {}
        return button;
      });
      return new ActionRowBuilder().addComponents(...components);
    });
    try {
      await sentMessage.edit({ embeds: [lobbyEmbed], components: newRows });
    } catch (e) {
      console.error("Failed to update lobby view:", e);
    }
  }

  
  await updateLobbyView();

  
  const filter = (i) => {
    try {
      if (!i || !i.customId) return false;
      return (
        i.customId === "join" ||
        i.customId === "exit" ||
        i.customId === "explain" ||
        (typeof i.customId === "string" && i.customId.startsWith("place_"))
      );
    } catch (e) {
      return false;
    }
  };

  const collector = sentMessage.createMessageComponentCollector({
    filter,
    time: TIME_TO_START,
  });

  collector.on("collect", async (i) => {
    try {
      if (typeof i.customId === "string" && i.customId.startsWith("place_")) {
        const index = parseInt(i.customId.split("_")[1]);
        const ok = await checkJoiningGameAbility(i, players);
        if (!ok) return;

        if (players.some((p) => p.index === index)) {
          await i.reply({
            content: "🎲 | هذا الرقم محجوز بالفعل!",
            ephemeral: true,
          });
          return;
        }
        players.push({
          id: i.user.id,
          index,
          username: i.user.username || i.user.tag.split("#")[0],
          avatarURL:
            i.user.displayAvatarURL({ extension: "png", forceStatic: true }) ||
            "https://cdn.discordapp.com/embed/avatars/0.png",
          color: getRandomDarkHexCode(COLOR, index),
          protectedUntilRound: 0,
          reverseUntilRound: 0,
          frozenUntilRound: 0,
          usedAbilities: new Set(),
        });
        await i.reply({
          content: `🎲 | <@${i.user.id}> انضممت للعبة في المكان ${index + 1}!`,
          ephemeral: true,
        });
        await updateLobbyView();
      } else if (i.customId === "join") {
        const ok = await checkJoiningGameAbility(i, players);
        if (!ok) return;
        let index = Math.floor(Math.random() * 20);
        while (players.some((p) => p.index === index))
          index = Math.floor(Math.random() * 20);
        players.push({
          id: i.user.id,
          index,
          username: i.user.username || i.user.tag.split("#")[0],
          avatarURL:
            i.user.displayAvatarURL({ extension: "png", forceStatic: true }) ||
            "https://cdn.discordapp.com/embed/avatars/0.png",
          color: getRandomDarkHexCode(COLOR, index),
          protectedUntilRound: 0,
          reverseUntilRound: 0,
          frozenUntilRound: 0,
          usedAbilities: new Set(),
        });
        await i.reply({
          content: `🎲 | <@${i.user.id}> انضممت للعبة في المكان ${index + 1}!`,
          ephemeral: true,
        });
        await updateLobbyView();
      } else if (i.customId === "exit") {
        if (!players.some((p) => p.id === i.user.id)) {
          await i.reply({
            content: "🎲 | أنت لست في اللعبة!",
            ephemeral: true,
          });
          return;
        }
        const removed = players.find((p) => p.id === i.user.id);
        players.splice(players.indexOf(removed), 1);
        await i.reply({
          content: "🎲 | لقد خرجت من اللعبة بنجاح!",
          ephemeral: true,
        });
        await updateLobbyView();
      } else if (i.customId === "explain") {
        const embed = new EmbedBuilder()
          .setTitle("🎲 | شرح لعبة روليت")
          .setDescription(
            `
:black_joker:・كيفية المشاركة:
اضغط على الرقم للاختيار أو زر "دخول عشوائي".
ستبدأ اللعبة بعد <t:${nowTime + TIME_TO_START / 1000}:R>.
:blue_book:・كيفية اللعب:
ستختار العجلة لاعبًا عشوائيًا.
إذا كنت اللاعب المختار، ستختار لاعبًا لطرده أو استخدام قدرة.
القدرات: نووي (60نقطة), طرد عكسي (25نقطة), حماية (15نقطة), تجميد (8ن).
عندما يبقى لاعبان فقط ستُعلن الفائز.
`
          )
          .addFields(
            {
              name: "📉 | أدنى عدد للاعبين",
              value: `${MIN_PLAYERS}`,
              inline: true,
            },
            {
              name: "📈 | أقصى عدد للاعبين",
              value: `${MAX_PLAYERS}`,
              inline: true,
            }
          )
          .setColor("#5865F2");
        await i.reply({ embeds: [embed], ephemeral: true });
      }
    } catch (error) {
      console.error("Error in lobby collector:", error);
      try {
        await i.reply({
          content: "حدث خطأ. يرجى المحاولة مرة أخرى.",
          ephemeral: true,
        });
      } catch (e) {}
    }
  });

  collector.on("end", async () => {
    try {
      
      rows.forEach((row) =>
        row.components.forEach((btn) => {
          try {
            if (btn && typeof btn.setDisabled === "function")
              btn.setDisabled(true);
          } catch (e) {}
        })
      );
      try {
        await sentMessage.edit({ components: rows });
      } catch (e) {}

      if (players.length < MIN_PLAYERS) {
        await context.channel.send(
          "لا يوجد عدد كافٍ من اللاعبين لبدء اللعبة. 🚶‍♂️"
        );
        resetGameData();
        callback(null, false, 0, "لم يكتمل عدد اللاعبين.");
        return;
      }
      let eliminatedPlayers = [];
      await context.channel.send("🕹️ | اللعبة تبدأ الآن!");
      await sleep(3000);
      await prepareRound(
        context,
        players,
        eliminatedPlayers,
        context.client,
        callback
      );
    } catch (err) {
      console.error("Error ending lobby collector:", err);
      resetGameData();
      callback(null, false, 0, "حدث خطأ عند بدء اللعبة.");
    }
  });
}

async function prepareRound(
  context,
  players,
  eliminatedPlayers,
  client,
  callback
) {
  try {
    const currentTime = Date.now();
    if (currentTime - LAST_ROUND_TIME < 5000) {
      await sleep(5000 - (currentTime - LAST_ROUND_TIME));
    }
    LAST_ROUND_TIME = Date.now();
    ROUND_COUNTER++;

    let takeVote = false;

    
    if (players.length === 1) {
      
      const winner = players[0];
      await win(winner.id, context);
      await sleep(2000);
      await context.channel.send({
        content: `🎉 | الفائز هو <@${winner.id}>! تهانينا!`,
      });
      resetGameData();
      callback(null, false, 0, "انتهت اللعبة! 🏆");
      return;
    }

    
    if (players.length === 2) {
      if (CURRENTLY_SENDING_IMAGE) return;
      CURRENTLY_SENDING_IMAGE = true;

      try {
        const { playerChosen, image } = await selectRandomPlayer(
          context,
          players
        );
        const winner = playerChosen;
        const attachment = new AttachmentBuilder(image, {
          name: "roulette.png",
        });
        await context.channel.send({ files: [attachment] });
        await sleep(2000);

        
        await win(winner.id, context);
        await sleep(2000);
        await context.channel.send({
          content: `🎉 | الفائز هو <@${winner.id}>! تهانينا!`,
        });

        resetGameData();
        callback(null, false, 0, "انتهت اللعبة! 🏆");
        return;
      } catch (err) {
        
        console.error("Error in final round:", err);
        const randomIndex = Math.floor(Math.random() * 2);
        const winner = players[randomIndex];
        await context.channel.send(
          `🎲 | حدث خطأ، الفائز هو <@${winner.id}>!`
        );
        await win(winner.id, context);
        resetGameData();
        callback(null, false, 0, "انتهت اللعبة! 🏆");
        return;
      }
    }

    
    if (CURRENTLY_SENDING_IMAGE) return;
    CURRENTLY_SENDING_IMAGE = true;

    try {
      const { playerChosen, image, chosenIndex } = await selectRandomPlayer(
        context,
        players
      );
      const randomPlayerId = playerChosen.id;

      if (randomPlayerId === LAST_SELECTED_PLAYER_ID && players.length > 2) {
        CURRENTLY_SENDING_IMAGE = false;
        await prepareRound(
          context,
          players,
          eliminatedPlayers,
          client,
          callback
        ); 
        return;
      }
      LAST_SELECTED_PLAYER_ID = randomPlayerId;

      const attachment = new AttachmentBuilder(image, { name: "roulette.png" });
      await context.channel.send({ files: [attachment] });
      await sleep(1500);
      CURRENTLY_SENDING_IMAGE = false;

      
      
      const chooserObj = players.find((p) => p.id === randomPlayerId);
      if (chooserObj && !chooserObj.usedAbilities) {
        chooserObj.usedAbilities = new Set(); 
      }
      const chooserUsedAbilities =
        (chooserObj && chooserObj.usedAbilities) || new Set();

      const isFrozen =
        chooserObj && chooserObj.frozenUntilRound >= ROUND_COUNTER;
      if (isFrozen) {
        
        await context.channel.send(
          `<:GXMark:1285614465928138847> | <@${randomPlayerId}> مجمد ولا يستطيع التصرف وتمت إزالته.`
        );
        await lose(randomPlayerId, context);
        eliminatedPlayers.push(chooserObj);
        const idx = players.findIndex((p) => p.id === randomPlayerId);
        if (idx !== -1) players.splice(idx, 1);
        await prepareRound(
          context,
          players,
          eliminatedPlayers,
          client,
          callback
        );
        return;
      }

      
      const chooserScore = (await db.getUserPoints(randomPlayerId)) || 0;

      
      const filteredPlayers = players.filter((p) => p.id !== randomPlayerId);
      const targetRows = [];
      const chunkSize = 5;
      for (let i = 0; i < filteredPlayers.length; i += chunkSize) {
        const comps = filteredPlayers
          .slice(i, i + chunkSize)
          .map((pl) =>
            new ButtonBuilder()
              .setCustomId(`eliminate_${pl.id}`)
              .setEmoji(emojis[pl.index] || "🔲")
              .setLabel(clampLabel(pl.username, 80))
              .setStyle(ButtonStyle.Secondary)
          );
        targetRows.push(new ActionRowBuilder().addComponents(...comps));
      }

      
      
      const actionButtons = [];
      if (players.length > 2)
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("eliminate_random")
            .setEmoji("🎲")
            .setLabel("طرد عشوائي")
            .setStyle(ButtonStyle.Primary)
        );
      if (chooserScore >= 20 && !chooserUsedAbilities.has("nuclear"))
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("eliminate_nuclear")
            .setEmoji("☢️")
            .setLabel("نووي (20ن)")
            .setStyle(ButtonStyle.Danger)
        );
      if (chooserScore >= 12 && !chooserUsedAbilities.has("reverse"))
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("ability_reverse")
            .setEmoji("🔁")
            .setLabel("طرد عكسي (12ن)")
            .setStyle(ButtonStyle.Secondary)
        );
      if (chooserScore >= 10 && !chooserUsedAbilities.has("protect"))
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("ability_protect")
            .setEmoji("🛡️")
            .setLabel("حماية (10ن)")
            .setStyle(ButtonStyle.Success)
        );
      if (chooserScore >= 8 && !chooserUsedAbilities.has("freeze"))
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("ability_freeze")
            .setEmoji("❄️")
            .setLabel("تجميد (8ن)")
            .setStyle(ButtonStyle.Secondary)
        );
      if (chooserScore >= 2 && !chooserUsedAbilities.has("twice"))
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("eliminate_twice")
            .setEmoji("🔥")
            .setLabel("طرد مرتين (2ن)")
            .setStyle(ButtonStyle.Secondary)
        );
      if (
        eliminatedPlayers.length > 0 &&
        chooserScore >= 2 &&
        !chooserUsedAbilities.has("revive")
      )
        actionButtons.push(
          new ButtonBuilder()
            .setCustomId("eliminate_revive")
            .setEmoji("🔄")
            .setLabel("إحياء لاعب (2ن)")
            .setStyle(ButtonStyle.Success)
        );
      actionButtons.push(
        new ButtonBuilder()
          .setCustomId("eliminate_withdraw")
          .setEmoji("<:Gleave:1285563197092401214>") 
          .setLabel("الانسحاب")
          .setStyle(ButtonStyle.Danger)
      );

      
      for (let i = 0; i < actionButtons.length; i += 5) {
        targetRows.push(
          new ActionRowBuilder().addComponents(...actionButtons.slice(i, i + 5))
        );
      }

      const contentMsg =
        eliminatedPlayers.length > 0
          ? `🎲 | <@${randomPlayerId}> لديك **15 ثانية** لاختيار لاعب لطرده، او يمكنك استخدام قدرة.`
          : `🎲 | <@${randomPlayerId}> لديك **25 ثانية** لاختيار لاعب لطرده، او يمكنك استخدام قدرة.`;

      
      let eliminationMessageA, eliminationMessageB;
      let originalHalf = 0;
      if (targetRows.length <= 5) {
        eliminationMessageA = await context.channel.send({
          content: contentMsg,
          components: targetRows,
        });
        originalHalf = targetRows.length;
      } else {
        originalHalf = Math.ceil(targetRows.length / 2);
        eliminationMessageA = await context.channel.send({
          content: contentMsg,
          components: targetRows.slice(0, originalHalf),
        });
        eliminationMessageB = await context.channel.send({
          content: "أكمل الاختيارات هنا:",
          components: targetRows.slice(originalHalf),
        });
      }

      
      const collectors = [];
      const eliminateFilter = (ii) =>
        typeof ii.customId === "string" &&
        (ii.customId.startsWith("eliminate_") ||
          ii.customId.startsWith("eliminate_random") ||
          ii.customId.startsWith("eliminate_nuclear") ||
          ii.customId.startsWith("eliminate_twice") ||
          ii.customId.startsWith("eliminate_revive") ||
          ii.customId.startsWith("eliminate_withdraw") ||
          ii.customId.startsWith("ability_"));
      const collectorTimeout = eliminatedPlayers.length > 0 ? 15000 : 25000;

      const createCollector = (msg) =>
        msg.createMessageComponentCollector({
          filter: eliminateFilter,
          time: collectorTimeout,
        });
      collectors.push(createCollector(eliminationMessageA));
      if (eliminationMessageB)
        collectors.push(createCollector(eliminationMessageB));

      let kicktwice = { status: false, count: 0, firstTargetId: null };
      let playerHasWithdraw = false;
      let hasBeenReset = false;
      let voteTaken = false;

      const stopAll = (reason) =>
        collectors.forEach((c) => {
          try {
            c.stop(reason);
          } catch (e) {}
        });

      
      const handleStandardElimination = async (
        chooserId,
        targetId,
        interaction
      ) => {
        const targetObj = players.find((p) => p.id === targetId);
        
        if (!targetObj) return;

        
        if (targetObj.protectedUntilRound >= ROUND_COUNTER) {
          targetObj.protectedUntilRound = 0; 
          await interaction.update({
            content: `🛡️ | تم منع محاولة طرد <@${targetId}> بواسطة الحماية!`,
            components: [],
          });
          await prepareRound(
            context,
            players,
            eliminatedPlayers,
            client,
            callback
          );
          return;
        }
        
        if (targetObj.reverseUntilRound >= ROUND_COUNTER) {
          targetObj.reverseUntilRound = 0; 
          await interaction.update({
            content: `🔁 | رد الطرد! <@${chooserId}> تم طردك بدلًا من <@${targetId}>!`,
            components: [],
          });
          await lose(chooserId, context);
          eliminatedPlayers.push(chooserObj);
          const idx = players.findIndex((p) => p.id === chooserId);
          if (idx !== -1) players.splice(idx, 1);
          await prepareRound(
            context,
            players,
            eliminatedPlayers,
            client,
            callback
          );
          return;
        }

        
        if (kicktwice.status && kicktwice.count > 1) {
          
          await interaction.reply({
            content: `💣 | تم طرد <@${targetId}>. اختر اللاعب الثاني.`,
            ephemeral: true,
          });

          
          const newRows = [];
          if (eliminationMessageA)
            newRows.push(...eliminationMessageA.components);
          if (eliminationMessageB)
            newRows.push(...eliminationMessageB.components);

          const updatedRows = newRows.map((row) => {
            const components = row.components.map((button) => {
              if (button.customId === `eliminate_${targetId}`) {
                return ButtonBuilder.from(button)
                  .setDisabled(true)
                  .setLabel(`${button.label} (تم الطرد)`);
              }
              return button;
            });
            return new ActionRowBuilder().addComponents(...components);
          });

          if (eliminationMessageA)
            await eliminationMessageA.edit({
              components: updatedRows.slice(0, originalHalf),
            });
          if (eliminationMessageB)
            await eliminationMessageB.edit({
              components: updatedRows.slice(originalHalf),
            });
          
          kicktwice.firstTargetId = targetId;
        } else {
          
          if (kicktwice.status && kicktwice.firstTargetId) {
            
            await interaction.update({
              content: `💣 | تم طرد <@${kicktwice.firstTargetId}> و <@${targetId}>.`,
              components: [],
            });
          } else {
            
            await interaction.update({
              content: `💣 | تم طرد <@${targetId}>.`,
              components: [],
            });
          }
        }

        await lose(targetId, context);
        eliminatedPlayers.push(targetObj);
        const idx = players.findIndex((p) => p.id === targetId);
        if (idx !== -1) players.splice(idx, 1);

        if (kicktwice.status) {
          kicktwice.count--;
          if (kicktwice.count > 0) {
            
            voteTaken = false;
            return;
          } else {
            kicktwice.status = false;
            kicktwice.firstTargetId = null; 
            await prepareRound(
              context,
              players,
              eliminatedPlayers,
              client,
              callback
            );
            return;
          }
        } else {
          await prepareRound(
            context,
            players,
            eliminatedPlayers,
            client,
            callback
          );
          return;
        }
      };

      
      collectors.forEach((col) => {
        col.on("collect", async (ii) => {
          try {
            if (ii.user.id !== randomPlayerId) {
              await ii.reply({
                content: `🎲 | ليس دورك <@${ii.user.id}>`,
                ephemeral: true,
              });
              return;
            }

            
            
            const isReversed =
              chooserObj && chooserObj.reverseUntilRound >= ROUND_COUNTER;

            const isEliminationAttempt =
              (ii.customId.startsWith("eliminate_") &&
                !ii.customId.startsWith("eliminate_withdraw") &&
                !ii.customId.startsWith("eliminate_revive")) ||
              ii.customId === "eliminate_random" ||
              ii.customId === "eliminate_nuclear" ||
              ii.customId === "eliminate_twice";

            if (isReversed && isEliminationAttempt) {
              chooserObj.reverseUntilRound = 0; 
              await ii.update({
                content: `🔁 | لقد حاولت طرد لاعب وأنت تحت تأثير "طرد عكسي"! تم طردك.`,
                components: [],
              });

              await lose(randomPlayerId, context);
              eliminatedPlayers.push(chooserObj);
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) players.splice(idx, 1);

              voteTaken = true;
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            }

            voteTaken = true;
            const cid = ii.customId;

            if (cid === "eliminate_withdraw") {
              
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) players.splice(idx, 1);
              await ii.update({
                content: `🎲 | <@${randomPlayerId}> قرر الانسحاب...`,
                components: [],
              });
              playerHasWithdraw = true;
              await lose(randomPlayerId, context);
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            } else if (cid === "eliminate_random") {
              await ii.update({
                content: `🎲 | <@${randomPlayerId}> قرر الطرد العشوائي...`,
                components: [],
              });
              let randomTarget =
                filteredPlayers[
                  Math.floor(Math.random() * filteredPlayers.length)
                ];
              await context.channel.send(
                `💣 | <@${randomPlayerId}> قام بطرد عشوائيا اللاعب: <@${randomTarget.id}>`
              );
              await lose(randomTarget.id, context);
              eliminatedPlayers.push(randomTarget);
              players.splice(
                players.findIndex((p) => p.id === randomTarget.id),
                1
              );
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            } else if (cid === "eliminate_nuclear") {
              await ii.update({ components: [] });
              await db.removePoints(randomPlayerId, 20);
              chooserObj.usedAbilities.add("nuclear"); 
              const others = players.filter((p) => p.id !== randomPlayerId);
              for (const op of others) {
                await lose(op.id, context);
                eliminatedPlayers.push(op);
              }
              for (let k = players.length - 1; k >= 0; k--) {
                if (players[k].id !== randomPlayerId) players.splice(k, 1);
              }
              await context.channel.send(
                `☢️ | <@${randomPlayerId}> استخدم النووي وطرد: ${others
                  .map((p) => `<@${p.id}>`)
                  .join(", ")}`
              );
              stopAll("done");
              await prepareRound(
                context,
                players,
                eliminatedPlayers,
                client,
                callback
              );
              return;
            } else if (cid === "eliminate_twice") {
              await ii.reply({
                content: `🎲 | لقد قررت طرد مرتين. تم خصم 2 نقاط. اختر اللاعب الأول.`,
                ephemeral: true,
              });
              kicktwice.count = 2;
              kicktwice.status = true;
              kicktwice.firstTargetId = null;
              await db.removePoints(randomPlayerId, 2);
              chooserObj.usedAbilities.add("twice"); 
              voteTaken = false;
              return;
            } else if (cid === "eliminate_revive") {
              const reviveRows = await eliminatedPlayersButtons(
                eliminatedPlayers
              );
              if (!reviveRows || reviveRows.length === 0) {
                await ii.reply({
                  content: "لا يوجد لاعبين لإحيائهم!",
                  ephemeral: true,
                });
                voteTaken = false;
                return;
              }
              await ii.update({
                content: `🎲 | <@${randomPlayerId}> قرر إحياء لاعب...`,
                components: reviveRows,
              });
              await db.removePoints(randomPlayerId, 2);
              chooserObj.usedAbilities.add("revive"); 
              const reviveCollector = ii.message.createMessageComponentCollector({
                filter: (r) =>
                  typeof r.customId === "string" &&
                  r.customId.startsWith("revive_") &&
                  r.user.id === randomPlayerId,
                time: 10000,
              });
              reviveCollector.on("collect", async (ri) => {
                const revivedPlayerId = ri.customId.split("_")[1];
                const revivedPlayer = eliminatedPlayers.find(
                  (p) => p.id === revivedPlayerId
                );
                await removeLoss(revivedPlayerId, context);
                players.push(revivedPlayer);
                eliminatedPlayers.splice(
                  eliminatedPlayers.findIndex((p) => p.id === revivedPlayerId),
                  1
                );
                await ri.update({
                  content: `🎲 | <@${randomPlayerId}> قام بإحياء <@${revivedPlayerId}>!`,
                  components: [],
                });
                reviveCollector.stop();
                stopAll("done");
                await prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
                  callback
                );
              });
              reviveCollector.on("end", (col) => {
                if (!col || col.size === 0) {
                  context.channel.send(
                    `<@${randomPlayerId}> لم تختر أحد للإحياء.`
                  );
                  
                  
                  stopAll("done");
                  prepareRound(
                    context,
                    players,
                    eliminatedPlayers,
                    client,
                    callback
                  );
                }
              });
              return;
            } else if (cid.startsWith("ability_")) {
              const ability = cid.split("_")[1];
              const abilityTargets = players.map(
                (p) =>
                  new ButtonBuilder()
                    .setCustomId(`abilitytarget_${ability}_${p.id}`)
                    .setEmoji(emojis[p.index] || "🔲")
                    .setLabel(clampLabel(p.username, 80))
                    .setStyle(ButtonStyle.Secondary)
              );
              const abilityRows = [];
              for (let r = 0; r < abilityTargets.length; r += 5)
                abilityRows.push(
                  new ActionRowBuilder().addComponents(
                    ...abilityTargets.slice(r, r + 5)
                  )
                );
              await ii.update({
                content: `اختر لاعب لتطبيق القدرة (${ability}):`,
                components: abilityRows,
              });
              const abilityCollector = ii.message.createMessageComponentCollector(
                {
                  filter: (ai) =>
                    typeof ai.customId === "string" &&
                    ai.customId.startsWith("abilitytarget_") &&
                    ai.user.id === randomPlayerId,
                  time: 15000,
                }
              );
              abilityCollector.on("collect", async (ai) => {
                const parts = ai.customId.split("_");
                const chosenAbility = parts[1];
                const targetId = parts[2];
                const targetObj = players.find((p) => p.id === targetId);
                if (!targetObj) {
                  await ai.reply({
                    content: "لا يمكن العثور على اللاعب.",
                    ephemeral: true,
                  });
                  return;
                }
                if (chosenAbility === "reverse") {
                  await db.removePoints(randomPlayerId, 12);
                  targetObj.reverseUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("reverse"); 
                  await ai.update({
                    content: `?? | تم تطبيق طرد عكسي على <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                } else if (chosenAbility === "protect") {
                  await db.removePoints(randomPlayerId, 10);
                  targetObj.protectedUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("protect"); 
                  await ai.update({
                    content: `🛡️ | تم حماية <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                } else if (chosenAbility === "freeze") {
                  await db.removePoints(randomPlayerId, 8);
                  targetObj.frozenUntilRound = ROUND_COUNTER + 1;
                  chooserObj.usedAbilities.add("freeze"); 
                  await ai.update({
                    content: `❄️ | تم تجميد <@${targetId}> للجولة القادمة.`,
                    components: [],
                  });
                } else {
                  await ai.update({
                    content: `القدرة غير معروفة.`,
                    components: [],
                  });
                }
                abilityCollector.stop();
                stopAll("done");
                await prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
                  callback
                );
              });
              abilityCollector.on("end", (col) => {
                if (!col || col.size === 0) {
                  stopAll("done");
                  prepareRound(
                    context,
                    players,
                    eliminatedPlayers,
                    client,
                    callback
                  );
                }
              });
              return;
            } else if (cid.startsWith("eliminate_")) {
              const targetId = cid.split("_")[1];
              await handleStandardElimination(randomPlayerId, targetId, ii);
              return;
            } else {
              await ii.reply({ content: "خيار غير معروف.", ephemeral: true });
              return;
            }
          } catch (err) {
            console.error("Error in elimination collect:", err);
            try {
              await ii.reply({
                content: "حدث خطأ. سيتم المتابعة.",
                ephemeral: true,
              });
            } catch (e) {}
            stopAll("error");
            await prepareRound(
              context,
              players,
              eliminatedPlayers,
              client,
              callback
            );
          }
        });
        col.on("end", (collected, reason) => {
          if (
            !voteTaken &&
            reason !== "reset" &&
            !playerHasWithdraw &&
            !hasBeenReset &&
            !kicktwice.status
          ) {
            try {
              const idx = players.findIndex((p) => p.id === randomPlayerId);
              if (idx !== -1) {
                const chooserObjOnEnd = players[idx];
                players.splice(idx, 1);
                eliminatedPlayers.push(chooserObjOnEnd);
                lose(randomPlayerId, context);
                context.channel.send(
                  `<:GXMark:1285614465928138847> | <@${randomPlayerId}> لم تختر أحد وتم طردك.`
                );
                stopAll("timeout");
                prepareRound(
                  context,
                  players,
                  eliminatedPlayers,
                  client,
callback
                );
              }
            } catch (e) {
              console.error("Error handling no-vote end:", e);
              resetGameData();
              callback(null, false, 0, "حدث خطأ فادح.");
            }
          }
        });
      }); 
    } catch (err) {
      console.error("Error in prepareRound spinning:", err);
      CURRENTLY_SENDING_IMAGE = false;
      LAST_SELECTED_PLAYER_ID = null;
      await context.channel.send(
        "حدث خطأ أثناء اختيار اللاعب. سيتم اختيار لاعب عشوائي للمتابعة."
      );
      await sleep(3000);
      await prepareRound(
        context,
        players,
        eliminatedPlayers,
        client,
        callback
      );
    }
  } catch (err) {
    console.error("Fatal error in prepareRound:", err);
    await context.channel.send("حدث خطأ فادح. تم إنهاء اللعبة.");
    resetGameData();
    callback(null, false, 0, "حدث خطأ فادح.");
  }
}


async function updateMessage(message, players, rows, nowTime) {
  try {
    const sortedPlayers = players.sort((a, b) => a.index - b.index);
    const newMessage = `
🎲 | لعبة روليت
الوقت المتبقي لبدأ اللعبة: <t:${nowTime + TIME_TO_START / 1000}:R>
\n> اللاعبين الحاليين (${players.length} / ${MAX_PLAYERS}) :
${sortedPlayers
  .map((player) => `> ${emojis[player.index]} : <@${player.id}>`)
  .join("\n")}
`;
    await message.edit({ content: newMessage, components: rows });
  } catch (error) {
    console.error("Error updating message:", error);
  }
}



async function checkJoiningGameAbility(i, players) {
  if (players.some((player) => player.id === i.user.id)) {
    await i.reply({
      content: `✅ | <@${i.user.id}> لقد انضممت إلى اللعبة بالفعل!`,
      ephemeral: true,
    });
    return false;
  }
  if (players.length >= MAX_PLAYERS) {
    await i.reply({
      content: `😦 | <@${i.user.id}> اللعبة ممتلئة بالفعل!`,
      ephemeral: true,
    });
    return false;
  }
  return true;
}

async function eliminatedPlayersButtons(eliminatedPlayers) {
  const maxButtonsPerRow = 5;
  let rows = [];
  function short(n, len = 12) {
    return n.length > len ? n.slice(0, len - 2) + ".." : n;
  }
  for (let i = 0; i < eliminatedPlayers.length; i += maxButtonsPerRow) {
    const buttons = eliminatedPlayers
      .slice(i, i + maxButtonsPerRow)
      .map((player) =>
        new ButtonBuilder()
          .setCustomId(`revive_${player.id}`)
          .setEmoji(emojis[player.index] || "🔲")
          .setLabel(clampLabel(player.username, 80))
          .setStyle(ButtonStyle.Secondary)
      );
    if (buttons.length)
      rows.push(new ActionRowBuilder().addComponents(...buttons));
  }
  return rows;
}

async function mapPlayersToSectors(context, players) {
  async function getUserAvatarURL(context, userId) {
    try {
      const user = await context.client.users.fetch(userId);
      return (
        user.displayAvatarURL({ extension: "png", size: 128 }) ||
        "https://cdn.discordapp.com/embed/avatars/0.png"
      );
    } catch (error) {
      console.error(`Error fetching avatar for user ${userId}:`, error);
      return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
  }

  const sectors = await Promise.all(
    players.map(async (player) => {
      return {
        number: player.index,
        username: player.username,
        color: player.color,
        id: player.id,
        avatarURL: await getUserAvatarURL(context, player.id),
      };
    })
  );
  return sectors;
}



async function selectRandomPlayer(context, players) {
  const messageContent =
    players.length === 2
      ? "<:roulette:1286202270647586816> | العجلة تدور لاختيار الفائز..."
      : "<:roulette:1286202270647586816> | العجلة تدور لاختيار اللاعب...";
  await context.channel.send(messageContent);

  try {
    const sectors = await mapPlayersToSectors(context, players);
    
    const shuffled = shuffleArray(sectors.sort((a, b) => a.number - b.number));
    const playerChosen = shuffled[0];
    
    
    const chosenId = playerChosen.id;
    const imageBuffer = await createStaticRouletteImage(shuffled, chosenId);
    return { playerChosen, image: imageBuffer, chosenIndex: chosenId };
  } catch (err) {
    console.error("Error selecting random player:", err);
    const randomIndex = Math.floor(Math.random() * players.length);
    const playerChosen = players[randomIndex];
    const canvas = createCanvas(350, 350);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2f3136";
    ctx.fillRect(0, 0, 350, 350);
    ctx.fillStyle = "#ffffff";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("تم اختيار لاعب عشوائي", 175, 160);
    ctx.fillText(playerChosen.username, 175, 190);
    return {
      playerChosen,
      image: canvas.toBuffer("image/png"),
      chosenIndex: playerChosen.id,
    };
  }
}

async function createStaticRouletteImage(shuffledMembers, chosenId) {
  try {
    const basePath = path.join(__dirname, "..", "img", "roulette.png");
    let baseImage = null;

    try {
      baseImage = await loadImage(basePath);
    } catch (err) {
      console.warn("⚠️ roulette.png not found, using solid background.");
    }

    const size = 700;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");

    
    if (baseImage) ctx.drawImage(baseImage, 0, 0, size, size);
    else {
      ctx.fillStyle = "#2C2F33";
      ctx.fillRect(0, 0, size, size);
    }

    const cx = size / 2;
    const cy = size / 2;
    const wheelRadius = size * 0.4;
    const innerRadius = wheelRadius * 0.35;
    const num = shuffledMembers.length || 1;
    const anglePer = (2 * Math.PI) / num;

    for (let i = 0; i < num; i++) {
      const start = -Math.PI / 2 + i * anglePer;
      const end = start + anglePer;
      const mid = (start + end) / 2;
      const player = shuffledMembers[i];
      const isChosen = player.id === chosenId;

      
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, wheelRadius, start, end);
      ctx.closePath();
      ctx.fillStyle = player.color || "#555";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      
      ctx.save();

      const textRadius = innerRadius + (wheelRadius - innerRadius) * 0.78;
      const x = cx + Math.cos(mid) * textRadius;
      const y = cy + Math.sin(mid) * textRadius;

      ctx.translate(x, y);
      ctx.rotate(mid);

      if (mid > Math.PI / 2 && mid < (3 * Math.PI) / 2) ctx.rotate(Math.PI);

      const label = clampLabel(player.username, 16);
      const fontSize = Math.max(12, Math.min(20, 180 / label.length));
      ctx.font = `${fontSize}px "Arial"`;
      ctx.fillStyle = isChosen ? "#39ff14" : "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }

    
    ctx.beginPath();
    ctx.arc(cx, cy, innerRadius, 0, 2 * Math.PI);
    ctx.fillStyle = "#2C2F33";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#fff";
    ctx.stroke();

    
    const chosen = shuffledMembers.find((p) => p.id === chosenId);
    if (chosen && chosen.avatarURL) {
      try {
        const avatar = await loadImage(chosen.avatarURL);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, innerRadius - 5, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
          avatar,
          cx - (innerRadius - 5),
          cy - (innerRadius - 5),
          (innerRadius - 5) * 2,
          (innerRadius - 5) * 2
        );
        ctx.restore();
      } catch (err) {
        console.warn("⚠️ Could not draw avatar:", err.message);
      }
    }

    return canvas.toBuffer("image/png");
  } catch (err) {
    console.error("createStaticRouletteImage() failed:", err);
    const fallback = createCanvas(300, 300);
    const ctx = fallback.getContext("2d");
    ctx.fillStyle = "#2f3136";
    ctx.fillRect(0, 0, 300, 300);
    ctx.fillStyle = "#fff";
    ctx.font = "20px Arial";
    ctx.textAlign = "center";
    ctx.fillText("تم اختيار لاعب", 150, 140);
    return fallback.toBuffer("image/png");
  }
}





function getRandomWinPoints() {
  const min = 5;
  const max = 5;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function win(player, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(player, points);
    console.log(`[Roulette] Gave ${points} points to winner ${player}`);
  } catch (e) {
    console.error(`[Roulette] Failed to apply win points: ${e}`);
  }
}
async function lose(player, context) {
  
}
async function removeLoss(player, context) {
  
}



function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function shuffleArray(arr) {
  const randomNum = Math.floor(Math.random() * arr.length) + 1;
  const part1 = arr.slice(-randomNum);
  const part2 = arr.slice(0, arr.length - randomNum);
  return [...part1, ...part2];
}

function getRandomDarkHexCode(baseColor, index) {
  const colors = [
  "#BEBEC0",
  "#616E77",
  "#BEBEC0",
  "#BEBEC0",
  "#616E77",
  "#616E77",
  "#BEBEC0",
  "#616E77",
  "#616E77",
  "#BEBEC0",
  "#616E77",
  "#BEBEC0",
  "#BEBEC0",
  "#616E77",
  "#616E77",
  "#BEBEC0",
  "#616E77",
  "#BEBEC0",
  "#616E77",
  "#BEBEC0"
  ];
  return colors[index % colors.length];
}