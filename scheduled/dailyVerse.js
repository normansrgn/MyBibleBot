const { getMeaningfulVerse, formatVerse, VERSE_THEMES } = require("../utils/bibleUtils");

function sendDailyVerse(bot, activeUsers, bibleData) {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const themeKeys = Object.keys(VERSE_THEMES);
  const dailyTheme = themeKeys[dayOfYear % themeKeys.length];
  
  activeUsers.forEach((chatId) => {
    try {
      const verse = getMeaningfulVerse(bibleData, dailyTheme);
      
      let text = `🌿 *Дневное вдохновение* \n\n`;
      text += formatVerse(verse);
      text += `\n\n_Пусть это слово укрепит вас сегодня!_`;

      bot.sendMessage(chatId, text, { 
        parse_mode: "Markdown",
        disable_web_page_preview: true
      }).catch((err) => {
        console.error(`Ошибка отправки стиха (chat ${chatId}):`, err.message);
        activeUsers.delete(chatId);
      });
    } catch (err) {
      console.error(`Ошибка генерации стиха для (chat ${chatId}):`, err.message);

      const verse = getRandomVerse(bibleData);
      bot.sendMessage(chatId, formatVerse(verse), { parse_mode: "Markdown" });
    }
  });
}

module.exports = { sendDailyVerse };