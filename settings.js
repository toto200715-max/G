
const fs = require('fs');

// Check if the settings file exists, if not create it
if (!fs.existsSync('./settings.json')) {
  fs.writeFileSync('./settings.json', JSON.stringify({ channels: [] }));
}

// Read the settings
const readSettings = () => {
  try {
    const data = fs.readFileSync('./settings.json', 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading settings:', err);
    return { channels: [] };
  }
};

// Save settings
const saveSettings = (data) => {
  try {
    fs.writeFileSync('./settings.json', JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error saving settings:', err);
    return false;
  }
};

// Add a channel to allowed channels
const addChannel = (channelId) => {
  const settings = readSettings();
  if (!settings.channels.includes(channelId)) {
    settings.channels.push(channelId);
    return saveSettings(settings);
  }
  return false;
};

// Remove a channel from allowed channels
const removeChannel = (channelId) => {
  const settings = readSettings();
  settings.channels = settings.channels.filter(id => id !== channelId);
  return saveSettings(settings);
};

// Check if a channel is allowed
const isChannelAllowed = (channelId) => {
  const settings = readSettings();
  return settings.channels.includes(channelId);
};

// Get all allowed channels
const getAllowedChannels = () => {
  const settings = readSettings();
  return settings.channels;
};

module.exports = {
  addChannel,
  removeChannel,
  isChannelAllowed,
  getAllowedChannels
};
