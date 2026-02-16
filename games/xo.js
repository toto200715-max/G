const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require("discord.js");
const db = require('../database.js');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 30;
const TIME_TO_START = 30000;
const TIME_TO_PLAY = 20000;

let GAME_ACTIVE = false;
let players = [];

module.exports = {
  name: 'xo',
  aliases: ["إكس_أو"],
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
}

function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

function getRandomWinPoints() {
    const min = 5;
    const max = 13;
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function win(playerId, context) {
  try {
    const points = getRandomWinPoints();
    await db.addPoints(playerId, points);
  } catch (e) {
    console.error(`[XO] Failed to apply win points: ${e}`)
  }
}
async function lose(playerId, context) { }

async function startGame(context, nowTime, callback) {
  players = [];

  const lobbyEmbed = new EmbedBuilder()
    .setTitle("Tic-Tac-Toe | ❌⭕")
    .setDescription(`> **الوقت المتبقي لبدأ اللعبة: <t:${nowTime + TIME_TO_START / 1000}:R>**`)
    .addFields({ name: `اللاعبين الحاليين (0 / ${MAX_PLAYERS})`, value: "لا يوجد لاعبين بعد..." })
    .setColor("#5865F2")
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("join").setLabel("دخول").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("exit").setLabel("خروج").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("explain").setLabel("شرح اللعبة").setStyle(ButtonStyle.Secondary)
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
      if (players.length < MAX_PLAYERS) {
        if (!players.some(p => p.id === i.user.id)) {
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
      if (players.some(p => p.id === i.user.id)) {
        players = players.filter((p) => p.id !== i.user.id);
        await updateLobbyMessage(sentMessage, players, nowTime);
        await i.reply({ content: `لقد غادرت اللعبة. 👋`, ephemeral: true });
      } else {
        await i.reply({ content: `لم تكن في اللعبة. ❓`, ephemeral: true });
      }
    } else if (i.customId === "explain") {
        const explainEmbed = new EmbedBuilder()
            .setTitle("❌⭕ | شرح لعبة إكس أو")
            .setColor("#5865F2")
            .setDescription(
`### **🃏・كيفية المشاركة:**
> 1. اضغط على زر "دخول" للمشاركة وزر "خروج" للمغادرة.
> 2. ستبدأ اللعبة بعد <t:${nowTime + TIME_TO_START / 1000}:R>.

### **📘・كيفية اللعب:**
> 1. هذه اللعبة بنظام البطولة (خروج المغلوب).
> 2. في كل جولة، سيتم اختيار لاعبين عشوائيين للمنافسة.
> 3. اللاعب الأول هو ❌ واللاعب الثاني هو ⭕.
> 4. يجب عليك اللعب خلال 20 ثانية وإلا سيتم طردك.
> 5. **الفائز** يتأهل للجولة التالية، و**الخاسر** يُطرد.
> 6. في حالة **التعادل**، يتم طرد كلا اللاعبين.
> 7. تنتهي اللعبة عند بقاء آخر لاعب.`
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
              name: `اللاعبين المشاركين (${players.length})`,
              value: players.length > 0 ? players.map((p) => `<@${p.id}>`).join(", ") : "لا يوجد"
          });
      await sentMessage.edit({ embeds: [endEmbed], components: [row] });
    } catch (error) { /* ignore */ }

    if (players.length < MIN_PLAYERS) {
      await context.channel.send(`لم يكن هناك عدد كافٍ من اللاعبين لبدء اللعبة. 🚪`);
      resetGameData();
      callback();
      return;
    }

    await context.channel.send(`👥 | اكتمل عدد اللاعبين! اللعبة ستبدأ الآن...`);
    await gameRound(context, callback);
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

async function gameRound(context, callback) {
    if (players.length === 1) {
        const winner = players[0];
        await context.channel.send(`👑 - <@${winner.id}> فاز باللعبة!`);
        await win(winner.id, context);
        resetGameData();
        callback();
        return;
    }

    if (players.length === 0) {
        await context.channel.send("❌ تم طرد جميع اللاعبين ، لم يفز أحد.");
        resetGameData();
        callback();
        return;
    }

    if (players.length === 3) {
        const shuffled = [...players].sort(() => 0.5 - Math.random());
        const player1 = shuffled[0];
        const player2 = shuffled[1];
        const lastPlayer = shuffled[2];

        await context.channel.send(`⚔️ | ❌ <@${player1.id}> ضد ⭕ <@${player2.id}>`);
        const eliminatedPlayers = await runMatch(context, player1, player2);

        if (eliminatedPlayers.length === 2) {
            await context.channel.send(`👑 - <@${lastPlayer.id}> فاز باللعبة!`);
            await win(lastPlayer.id, context);
            resetGameData();
            callback();
            return;
        } else {
            players = players.filter(p => !eliminatedPlayers.some(e => e.id === p.id));
        }
    } else {
        const shuffled = [...players].sort(() => 0.5 - Math.random());
        const player1 = shuffled[0];
        const player2 = shuffled[1];

        await context.channel.send(`⚔️ | ❌ <@${player1.id}> ضد ⭕ <@${player2.id}>`);
        await sleep(1000);

        const eliminatedPlayers = await runMatch(context, player1, player2);
        players = players.filter(p => !eliminatedPlayers.some(e => e.id === p.id));
    }

    await sleep(3000);
    await gameRound(context, callback);
}

async function runMatch(context, player1, player2) {
    return new Promise(async (resolve) => {
        let board = Array(9).fill(null);
        player1.symbol = '❌';
        player2.symbol = '⭕';

        const gameMessage = await context.channel.send({
            content: "جارٍ تجهيز اللوحة...",
            components: generateXOButtons(board)
        });

        takeTurn(player1, player2, player1, board, gameMessage, resolve);
    });
}

async function takeTurn(p1, p2, currentPlayer, board, gameMessage, resolve) {
    const components = generateXOButtons(board);
    const content = `⚔️ | ❌ <@${p1.id}> ضد ⭕ <@${p2.id}>\n\n<@${currentPlayer.id}> (${currentPlayer.symbol}) حان دورك للعب لديك ${TIME_TO_PLAY / 1000} ثانية`;

    await gameMessage.edit({ content, components });

    const filter = (i) => i.customId.startsWith('xo_') && i.user.id === currentPlayer.id;
    const collector = gameMessage.createMessageComponentCollector({
        filter,
        time: TIME_TO_PLAY,
        max: 1
    });

    collector.on('collect', async (i) => {
        await i.deferUpdate();
        const index = parseInt(i.customId.split('_')[1]);

        board[index] = currentPlayer.symbol;

        if (checkXOWin(board, currentPlayer.symbol)) {
            const loser = (currentPlayer.id === p1.id) ? p2 : p1;
            await gameMessage.edit({
                content: `🏆 | <@${currentPlayer.id}> (${currentPlayer.symbol}) فاز بالمباراة! تم طرد <@${loser.id}>.`,
                components: generateXOButtons(board, true)
            });
            resolve([loser]);
            return;
        }

        if (checkXOTie(board)) {
            await gameMessage.edit({
                content: `💣 | تعادل! تم طرد <@${p1.id}> و <@${p2.id}>.`,
                components: generateXOButtons(board, true)
            });
            resolve([p1, p2]);
            return;
        }

        const nextPlayer = (currentPlayer.id === p1.id) ? p2 : p1;
        takeTurn(p1, p2, nextPlayer, board, gameMessage, resolve);
    });

    collector.on('end', async (collected) => {
        if (collected.size === 0) {
            const loser = currentPlayer;
            const winner = (currentPlayer.id === p1.id) ? p2 : p1;
            await gameMessage.edit({
                content: `💣 | تم طرد <@${loser.id}> لعدم تفاعله في اللعبة. <@${winner.id}> يتأهل.`,
                components: generateXOButtons(board, true)
            });
            resolve([loser]);
        }
    });
}

function generateXOButtons(board, disabled = false) {
    let rows = [new ActionRowBuilder(), new ActionRowBuilder(), new ActionRowBuilder()];

    for (let i = 0; i < 9; i++) {
        const row = rows[Math.floor(i / 3)];
        const button = new ButtonBuilder().setCustomId('xo_' + i);

        if (board[i]) {
            button.setEmoji(board[i])
                  .setStyle(board[i] === '❌' ? ButtonStyle.Danger : ButtonStyle.Success)
                  .setDisabled(true);
        } else {
            button.setLabel('\u200b')
                  .setStyle(ButtonStyle.Secondary)
                  .setDisabled(disabled);
        }
        row.addComponents(button);
    }
    return rows;
}

function checkXOWin(board, symbol) {
    const winningCombos = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];

    for (const combo of winningCombos) {
        if (combo.every(index => board[index] === symbol)) {
            return true;
        }
    }
    return false;
}

function checkXOTie(board) {
    return board.every(cell => cell !== null) &&
           !checkXOWin(board, '❌') &&
           !checkXOWin(board, '⭕');
}
