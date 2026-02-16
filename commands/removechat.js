const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const settings = require('../settings.js');

module.exports = {
  name: 'removechat',
  execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need administrator permissions to use this command!');
    }

    const channel = message.mentions.channels.first() || message.channel;
    if (!settings.isChannelAllowed(channel.id)) {
      return message.reply('❌ | This channel is not registered as a game channel.');
    }
    settings.removeChannel(channel.id);

    const embed = new EmbedBuilder()
      .setColor(0xFF0000)
      .setDescription(`❌ | <#${channel.id}> has been removed from game channels`);

    message.channel.send({ embeds: [embed] });
  }
};