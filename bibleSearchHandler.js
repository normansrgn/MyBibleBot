// bibleSearchHandler.js

function handleBibleSearchCommand(bot, bibleData, formatVerse) {
  bot.onText(/^\/biblesearch(?:@[\w_]+)?\s+(.+)/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1]?.trim().toLowerCase();

    if (!query) {
      await bot.sendMessage(chatId, '✍️ Напишите слова для поиска. Пример: `/biblesearch любовь терпит`', {
        parse_mode: "Markdown"
      });
      return;
    }

    const keywords = query.split(/\s+/);
    const results = [];

    for (const book of bibleData) {
      for (let i = 0; i < book.chapters.length; i++) {
        const chapter = book.chapters[i];
        for (let j = 0; j < chapter.length; j++) {
          const verseText = chapter[j].toLowerCase();
          if (keywords.every(word => verseText.includes(word))) {
            results.push({
              bookName: book.name,
              chapter: i + 1,
              verse: j + 1,
              text: chapter[j]
            });
            if (results.length >= 3) break;
          }
        }
        if (results.length >= 3) break;
      }
      if (results.length >= 3) break;
    }

    if (results.length === 0) {
      await bot.sendMessage(chatId, '❌ Стихи не найдены. Попробуйте другие слова.');
    } else {
      for (const verse of results) {
        await bot.sendMessage(chatId, formatVerse(verse), {
          parse_mode: "Markdown",
        });
      }
    }
  });
}

module.exports = { handleBibleSearchCommand };