
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const settings = require('../settings.js');

module.exports = {
  name: 'setchat',
  execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('You need administrator permissions to use this command!');
    }
    
    const channel = message.mentions.channels.first() || message.channel;
    settings.addChannel(channel.id);
    
    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setDescription(`✅ | <#${channel.id}> has been set as a game channel`);
    
    message.channel.send({ embeds: [embed] });
  }
};
