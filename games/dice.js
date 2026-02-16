const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  AttachmentBuilder,
} = require("discord.js");
const db = require('../database.js');
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;
const TIME_TO_START = 30000;
const TIME_TO_ROLL = 15000;
const TOTAL_ROUNDS = 3;

const IMG_PATH = "../img/dice/";
const GAME_BOARD_PATH = path.join(__dirname, IMG_PATH, "game.png");
const FONT_PATH = path.join(__dirname, "../img/Fonts/IBMBold.ttf");

const ALL_ROLLS = [
    'number_1', 'number_2', 'number_3', 'number_4', 'number_5', 'number_6',
    'plus_1', 'plus_2', 'plus_3', 'plus_4', 'plus_5', 'plus_6',
    'minus_1', 'minus_2', 'minus_3', 'minus_4', 'minus_5', 'minus_6',
    'zero', 'ban_someone', 'double_2', 'double_3'
];

const COORDS = {
    teamAPoints: { x: 165, y: 100 },
    teamBPoints: { x: 800, y: 100 },
    round: { x: 480, y: 560 },
    teamA: [
        { user: { x: 180, y: 215 }, points: { x: 372, y: 215 } },
{ user: { x: 180, y: 295 }, points: { x: 372, y: 295 } },
{ user: { x: 180, y: 375 }, points: { x: 372, y: 375 } },
{ user: { x: 180, y: 445 }, points: { x: 372, y: 445 } },
{ user: { x: 180, y: 535 }, points: { x: 372, y: 535 } },
{ user: { x: 180, y: 605 }, points: { x: 372, y: 605 } },
    ],
    teamB: [
        { user: { x: 712, y: 215 }, points: { x: 582, y: 215 } },
{ user: { x: 712, y: 295 }, points: { x: 582, y: 295 } },
{ user: { x: 712, y: 375 }, points: { x: 582, y: 375 } },
{ user: { x: 712, y: 455 }, points: { x: 582, y: 455 } },
{ user: { x: 712, y: 535 }, points: { x: 582, y: 535 } },
{ user: { x: 712, y: 605 }, points: { x: 582, y: 605 } },
    ]
};

let GAME_ACTIVE = false;
let teamA = [];
let teamB = [];
let currentRound = 0;
let bannedForRound = new Set();

try {
    GlobalFonts.registerFromPath(FONT_PATH, "IBMBold");
} catch (e) {
    console.warn("[Dice Game] Could not load custom font. Using default.");
}

module.exports = {
  name: 'dice',
  aliases: ["نرد"],
  /**
   * @param {import('discord.js').Message} message
   * @param {string[]} args
   * @param {function} callback
   */
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
  teamA = [];
  teamB = [];
  currentRound = 0;
  bannedForRound.clear();
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
  } catch (e) { 
    console.error(`[Dice Game] Failed to apply win points: ${e}`) 
  }
}
async function lose(playerId, context) {}

async function startGame(context, nowTime, callback) {
  let lobbyPlayers = [];
  currentRound = 0;
  bannedForRound.clear();
  teamA = [];
  teamB = [];

  const lobbyEmbed = new EmbedBuilder()
    .setTitle("🎲 | لعبة النرد")
    .setDescription(`> **الوقت المتبقي لبدأ اللعبة: <t:${nowTime + TIME_TO_START / 1000}:R>**`)
    .addFields({ name: `اللاعبين الحاليين (0 / ${MAX_PLAYERS})`, value: "لا يوجد لاعبين بعد..." })
    .setColor("#DAA520")
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
  const collector = sentMessage.createMessageComponentCollector({ filter, time: TIME_TO_START });

  collector.on("collect", async (i) => {
    if (i.customId === "join") {
      if (lobbyPlayers.length < MAX_PLAYERS) {
        if (!lobbyPlayers.some(p => p.id === i.user.id)) {
          lobbyPlayers.push({
            id: i.user.id,
            displayName: i.user.displayName,
            avatarURL: i.user.displayAvatarURL({ extension: "png", forceStatic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png",
          });
          await updateLobbyMessage(sentMessage, lobbyPlayers, nowTime);
          await i.reply({ content: `لقد انضممت إلى اللعبة! 🎉`, ephemeral: true });
        } else {
          await i.reply({ content: `أنت بالفعل في اللعبة! 🚫`, ephemeral: true });
        }
      } else {
        await i.reply({ content: `اللعبة ممتلئة! 🚪`, ephemeral: true });
      }
    } else if (i.customId === "exit") {
      if (lobbyPlayers.some(p => p.id === i.user.id)) {
        lobbyPlayers = lobbyPlayers.filter((p) => p.id !== i.user.id);
        await updateLobbyMessage(sentMessage, lobbyPlayers, nowTime);
        await i.reply({ content: `لقد غادرت اللعبة. 👋`, ephemeral: true });
      } else {
        await i.reply({ content: `لم تكن في اللعبة. ❓`, ephemeral: true });
      }
    } else if (i.customId === "explain") {
        const explainEmbed = new EmbedBuilder()
            .setTitle("🎲 | شرح لعبة النرد")
            .setColor("#DAA520")
            .setDescription(
`### **🃏・كيفية المشاركة:**
> 1. اضغط على زر "دخول" للمشاركة وزر "خروج" للمغادرة.
> 2. ستبدأ اللعبة بعد <t:${nowTime + TIME_TO_START / 1000}:R>.
        
### **📘・كيفية اللعب:**
> 1. عند بدء اللعبة، سيتم تقسيم اللاعبين إلى فريقين عشوائيين.
> 2. يوجد 3 جولات، وفي كل جولة يأخذ كل لاعب دوره.
> 3. في دورك، سترمي النرد ويضاف الرقم لنقاطك الشخصية ونقاط الفريق.
> 4. لديك فرصة لـ "اللعب مرة أخرى" (لإضافة أو استبدال نتيجتك) أو "تخطي" (لتأكيد نتيجتك).
> 5. بعض النردات خاصة: **+** (إضافة)، **-** (خصم)، **x** (مضاعفة)، **Ban** (لحظر لاعب آخر).
> 6. الفريق صاحب أعلى نقاط مجمعة بعد 3 جولات يفوز.`
            )
            .addFields(
                { name: "📉 | أدنى عدد للاعبين", value: `${MIN_PLAYERS}`, inline: true },
                { name: "📈 | أقصى عدد للاعبين", value: `${MAX_PLAYERS}`, inline: true }
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
              name: `اللاعبين المشاركين (${lobbyPlayers.length})`, 
              value: lobbyPlayers.length > 0 ? lobbyPlayers.map((p) => `<@${p.id}>`).join(", ") : "لا يوجد"
          });
      await sentMessage.edit({ embeds: [endEmbed], components: [row] });
    } catch (error) { /* ignore */ }

    if (lobbyPlayers.length < MIN_PLAYERS) {
      await context.channel.send(`لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة. 🚪`);
      resetGameData();
      callback();
      return;
    }
    
    splitTeams(lobbyPlayers);
    await context.channel.send(`👥 | اكتمل عدد اللاعبين! تم تقسيم الفرق. اللعبة ستبدأ الآن...`);
    await gameLoop(context, callback);
  });
}

async function updateLobbyMessage(sentMessage, lobbyPlayers, nowTime) {
    const playerList = lobbyPlayers.length > 0 
        ? lobbyPlayers.map((p) => `<@${p.id}>`).join(", ")
        : "لا يوجد لاعبين بعد...";
    const updatedEmbed = EmbedBuilder.from(sentMessage.embeds[0])
        .setFields({ name: `اللاعبين الحاليين (${lobbyPlayers.length} / ${MAX_PLAYERS})`, value: playerList });
    await sentMessage.edit({ embeds: [updatedEmbed] });
}

function splitTeams(lobbyPlayers) {
    const shuffled = [...lobbyPlayers].sort(() => 0.5 - Math.random());
    const mid = Math.ceil(shuffled.length / 2);
    teamA = shuffled.slice(0, mid).map(p => ({ ...p, points: 0 }));
    teamB = shuffled.slice(mid).map(p => ({ ...p, points: 0 }));
}

async function gameLoop(context, callback) {
    currentRound++;
    bannedForRound.clear();
    
    await context.channel.send(`--- 🏁 **الجولة ${currentRound} / ${TOTAL_ROUNDS}** 🏁 ---`);
    await sleep(1000);

    try {
        const boardImage = await generateGameImage();
        await context.channel.send({ files: [boardImage] });
    } catch (e) {
        console.error("Failed to generate game board image:", e);
        await context.channel.send("⚠️ | خطأ في عرض لوحة اللعبة.");
    }
    await sleep(4000);

    await context.channel.send("--- 🚩 **دور الفريق الأول** 🚩 ---");
    for (const player of teamA) {
        await runPlayerTurn(player, 'A', context, teamB);
        await sleep(4000);
    }

    await context.channel.send("--- 🚩 **دور الفريق الثاني** 🚩 ---");
    for (const player of teamB) {
        await runPlayerTurn(player, 'B', context, teamA);
        await sleep(4000);
    }

    if (currentRound < TOTAL_ROUNDS) {
        await context.channel.send(`--- ⌛ **نهاية الجولة ${currentRound}** ⌛ ---`);
        await gameLoop(context, callback);
    } else {
        await endGame(context, callback);
    }
}

async function runPlayerTurn(player, teamName, context, opponentTeam) {
    return new Promise(async (resolve) => {
        await sleep(1500);

        if (bannedForRound.has(player.id)) {
            const bannedImgPath = path.join(__dirname, IMG_PATH, teamName, "banned.png");
            try {
                await context.channel.send({
                    content: `🚫 | <@${player.id}> أنت محظور! لا يمكنك اللعب في هذه الجولة.`,
                    files: [bannedImgPath]
                });
            } catch(e) {
                console.error("Failed to load banned.png");
                await context.channel.send(`🚫 | <@${player.id}> أنت محظور! لا يمكنك اللعب في هذه الجولة.`);
            }
            resolve();
            return;
        }

        const basePoints = player.points;
        let turnPoints = 0;
        let roll1_name = "";

        const [roll1Name, roll1File, roll1Points, roll1Type] = rollDice(teamName);
        roll1_name = roll1Name;
        turnPoints = roll1Points;
        
        if (roll1Type === 'multiplier') turnPoints = 0;
        if (roll1Type === 'special') {
            await sleep(1000);
            await handleBan(player, context, opponentTeam, roll1File); 
        }

        player.points += turnPoints;

        const initialComponents = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary)
            )
        ];

        const roll1Msg = await context.channel.send({
            content: `🎲 <@${player.id}> لقد حصلت على **${turnPoints} نقاط**
● مجموع نقاطك الحالي : **${player.points}**`,
            files: [roll1File],
            components: initialComponents,
            fetchReply: true
        });

        const filter = (i) => (i.customId === 'roll_again' || i.customId === 'skip') && i.user.id === player.id;
        const collector = roll1Msg.createMessageComponentCollector({ filter, time: TIME_TO_ROLL, max: 1 });

        collector.on('collect', async (i) => {
            if (i.customId === 'skip') {
                const disabledComponents = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Danger).setDisabled(true)
                    )
                ];
                await i.update({
                    content: `🎲 <@${player.id}> قرر التخطي.
● مجموع نقاطه النهائي : **${player.points}**`,
                    files: [roll1File],
                    components: disabledComponents
                });
                return; 
            }

            if (i.customId === 'roll_again') {
                const [roll2Name, roll2File, roll2Points, roll2Type] = rollDice(teamName, turnPoints);

                let finalTurnPoints = 0;
                let message = "";

                if (roll2Type === 'numeric') {
                    finalTurnPoints = roll2Points;
                    player.points = basePoints + finalTurnPoints;
                    message = `🎲 <@${player.id}> (لعب مرة أخرى)
● حصل على **${finalTurnPoints} نقاط** (بدلاً من ${turnPoints})
● مجموع نقاطه النهائي : **${player.points}**`;
                } else {
                    finalTurnPoints = turnPoints + roll2Points;
                    player.points = basePoints + finalTurnPoints;
                    message = `🎲 <@${player.id}> (لعب مرة أخرى)
● حصل على **${roll2Points} نقاط** (إضافة إلى ${turnPoints})
● مجموع نقاطه النهائي : **${player.points}**`;
                }
                
                const disabledComponents = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Success).setDisabled(true),
                        new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    )
                ];

                await i.update({
                    content: `🎲 <@${player.id}> لقد حصلت على **${turnPoints} نقاط**
● مجموع نقاطك الحالي : **${basePoints + turnPoints}**`,
                    files: [roll1File],
                    components: disabledComponents
                });

                await i.channel.send({
                    content: message,
                    files: [roll2File]
                });

                if (roll2Type === 'special') {
                    await sleep(1000);
                    await handleBan(player, context, opponentTeam, roll2File);
                }
            }
        });

        collector.on('end', async (collected) => {
            if (!collected.size) {
                const disabledComponents = [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('roll_again').setLabel('العب مرة اخرى').setStyle(ButtonStyle.Secondary).setDisabled(true),
                        new ButtonBuilder().setCustomId('skip').setLabel('تخطي').setStyle(ButtonStyle.Secondary).setDisabled(true)
                    )
                ];
                await roll1Msg.edit({
                    content: `🎲 <@${player.id}> انتهى وقته.
● مجموع نقاطه النهائي : **${player.points}**`,
                    files: [roll1File],
                    components: disabledComponents
                });
            }
            resolve();
        });
    });
}

async function handleBan(player, context, opponentTeam, diceImageFile) {
    return new Promise(async (resolve) => {
        if (opponentTeam.length === 0) {
            resolve();
            return;
        }

        const buttons = opponentTeam.map(p => 
            new ButtonBuilder()
                .setCustomId(`ban_${p.id}`)
                .setLabel(p.displayName.substring(0, 80))
                .setStyle(ButtonStyle.Secondary)
        );
        const rows = [];
        while (buttons.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(...buttons.splice(0, 5)));
        }

        const banMsg = await context.channel.send({
            content: `⚔️ | <@${player.id}>, اختر لاعبًا من الفريق الآخر لحظره لهذه الجولة! (15 ثانية)`,
            files: [diceImageFile],
            components: rows,
            fetchReply: true
        });

        const filter = (i) => i.customId.startsWith('ban_') && i.user.id === player.id;
        const collector = banMsg.createMessageComponentCollector({ filter, time: 15000, max: 1 });

        collector.on('collect', async (i) => {
            const bannedId = i.customId.split('_')[1];
            bannedForRound.add(bannedId);
            await i.update({
                content: `🚫 | <@${player.id}> قام بحظر <@${bannedId}>!`,
                files: [diceImageFile],
                components: []
            });
        });

        collector.on('end', async (collected) => {
            if (!collected.size) {
                await banMsg.edit({
                    content: `⚔️ | <@${player.id}> لم يختر أحدًا.`,
                    files: [diceImageFile],
                    components: []
                });
            }
            resolve();
        });
    });
}

function rollDice(teamName, basePoints = 0) {
    const rollName = ALL_ROLLS[Math.floor(Math.random() * ALL_ROLLS.length)];
    const rollFile = path.join(__dirname, IMG_PATH, teamName, `${rollName}.png`);
    
    const [type, valStr] = rollName.split('_');
    const val = parseInt(valStr) || 0;

    switch (type) {
        case 'number':
            return [rollName, rollFile, val, 'numeric'];
        case 'plus':
            return [rollName, rollFile, val, 'modifier'];
        case 'minus':
            return [rollName, rollFile, -val, 'modifier'];
        case 'zero':
            return [rollName, rollFile, 0, 'numeric'];
        case 'double':
            const points = basePoints * (val - 1);
            return [rollName, rollFile, points, 'multiplier'];
        case 'ban':
            return [rollName, rollFile, 0, 'special'];
        default:
            return [rollName, rollFile, 0, 'numeric'];
    }
}

async function endGame(context, callback) {
    await context.channel.send(`--- 🏆 **نهاية اللعبة!** 🏆 ---`);
    await sleep(1000);
    
    try {
        const boardImage = await generateGameImage();
        await context.channel.send({ content: "النتائج النهائية:", files: [boardImage] });
    } catch (e) {
        console.error("Failed to generate final game board image:", e);
    }
    await sleep(4000);

    const teamAScore = teamA.reduce((sum, p) => sum + p.points, 0);
    const teamBScore = teamB.reduce((sum, p) => sum + p.points, 0);

    let winners = [];
    let losers = [];
    let winMessage = "";

    if (teamAScore > teamBScore) {
        winners = teamA;
        losers = teamB;
        winMessage = `:crown: - ${teamA.map(p => `<@${p.id}>`).join(' ')} فازوا باللعبة!`;
    } else if (teamBScore > teamAScore) {
        winners = teamB;
        losers = teamA;
        winMessage = `:crown: - ${teamB.map(p => `<@${p.id}>`).join(' ')} فازوا باللعبة!`;
    } else {
        winMessage = "👑 | تعادل! لا يوجد فائز.";
    }

    await context.channel.send(winMessage);

    for (const player of winners) {
        await win(player.id, context);
    }
    for (const player of losers) {
        await lose(player.id, context);
    }

    resetGameData();
    callback();
}

async function generateGameImage() {
    const canvas = createCanvas(960, 720);
    const ctx = canvas.getContext("2d");

    try {
        const background = await loadImage(GAME_BOARD_PATH);
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } catch (e) {
        console.error("Failed to load game board BG:", e);
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    const FONT_NAME = GlobalFonts.has("IBMBold") ? "IBMBold" : "Arial";
    ctx.font = `bold 30px ${FONT_NAME}`;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    const pad = (n) => String(n).padStart(2, '0');

    const teamAScore = teamA.reduce((sum, p) => sum + p.points, 0);
    const teamBScore = teamB.reduce((sum, p) => sum + p.points, 0);
    ctx.fillText(pad(teamAScore), COORDS.teamAPoints.x, COORDS.teamAPoints.y);
    ctx.fillText(pad(teamBScore), COORDS.teamBPoints.x, COORDS.teamBPoints.y);

    ctx.font = `bold 24px ${FONT_NAME}`;
    ctx.fillText(`${currentRound}/${TOTAL_ROUNDS}`, COORDS.round.x, COORDS.round.y);

    ctx.font = `bold 20px ${FONT_NAME}`;
    ctx.textAlign = "left";
    teamA.forEach((player, i) => {
        if (i >= COORDS.teamA.length) return;
        const pos = COORDS.teamA[i];
        ctx.fillText(player.displayName.substring(0, 15), pos.user.x, pos.user.y);
        ctx.fillText(pad(player.points), pos.points.x, pos.points.y);
    });

    ctx.font = `bold 20px ${FONT_NAME}`;
    ctx.textAlign = "right";
    teamB.forEach((player, i) => {
        if (i >= COORDS.teamB.length) return;
        const pos = COORDS.teamB[i];
        ctx.fillText(player.displayName.substring(0, 15), pos.user.x, pos.user.y);
        ctx.fillText(pad(player.points), pos.points.x, pos.points.y);
    });

    return new AttachmentBuilder(canvas.toBuffer("image/png"), { name: "dice-board.png" });
}
