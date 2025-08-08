const { searchVerse, formatVerse } = require("../utils/bibleUtils");

function setupInlineQueryHandlers(bot, bibleData) {
  bot.on('inline_query', async (query) => {
    const q = query.query.trim();
    if (!q) return;

    const results = [];
    const found = searchVerse(q, bibleData);

    if (Array.isArray(found)) {
      found.forEach((verse, index) => {
        results.push({
          type: 'article',
          id: String(index),
          title: `${verse.bookName} ${verse.chapter}:${verse.verse}`,
          input_message_content: {
            message_text: formatVerse(verse),
            parse_mode: 'Markdown',
          },
          description: verse.text.slice(0, 100),
        });
      });
    } else if (found && found.verse) {
      results.push({
        type: 'article',
        id: '1',
        title: `${found.bookName} ${found.chapter}:${found.verse}`,
        input_message_content: {
          message_text: formatVerse(found),
          parse_mode: 'Markdown',
        },
        description: found.text.slice(0, 100),
      });
    } else if (found && found.verses) {
      const versesText = found.verses
        .map((v) => `${v.verse}. ${v.text}`)
        .join("\n");
      results.push({
        type: 'article',
        id: 'range1',
        title: `${found.bookName} ${found.chapter}:${found.verses[0].verse}-${found.verses[found.verses.length - 1].verse}`,
        input_message_content: {
          message_text: `📖 *${found.bookName}* ${found.chapter}:${found.verses[0].verse}-${found.verses[found.verses.length - 1].verse}\n\n_${versesText}_`,
          parse_mode: 'Markdown',
        },
        description: versesText.slice(0, 100),
      });
    }

    if (results.length > 0) {
      bot.answerInlineQuery(query.id, results.slice(0, 10), {
        cache_time: 0,
        is_personal: true,
      });
    }
  });
}

module.exports = { setupInlineQueryHandlers };