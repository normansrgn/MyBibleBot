

function setupVerseMentionHandler(
  bot,
  bibleData,
  searchVerse,
  formatVerse,
  formatChapter
) {
  bot.getMe().then((me) => {
    const botUsername = me.username;

    bot.on("message", async (msg) => {
      const chatId = msg.chat.id;
      const text = msg.text;
      if (msg.chat.type === "private") return;
      if (typeof text !== "string" || !text.includes(`@${botUsername}`)) return;

      const mentionRegex = new RegExp(`@${botUsername}\\s+(.+)`, "i");
      const match = text.match(mentionRegex);

      if (match && match[1]) {
        const query = match[1].trim();
        const result = searchVerse(query);
        if (!result) {
          await bot.sendMessage(
            chatId,
            `❌ Не удалось найти стих по запросу: "${query}"`,
            {
              parse_mode: "Markdown",
            }
          );
          return;
        }

        try {
          if (Array.isArray(result)) {
            for (const verse of result) {
              await bot.sendMessage(chatId, formatVerse(verse), {
                parse_mode: "Markdown",
              });
            }
          } else if (result.verses) {
            const versesText = result.verses
              .map((v) => `${v.verse}. ${v.text}`)
              .join("\n");
            const message = `📖 *${result.bookName}* ${result.chapter}:${
              result.verses[0].verse
            }-${
              result.verses[result.verses.length - 1].verse
            }\n\n_${versesText}_`;
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
          } else if (result.verse) {
            await bot.sendMessage(chatId, formatVerse(result), {
              parse_mode: "Markdown",
            });
          } else {
            const chapterText = formatChapter(result.book, result.chapter);
            await bot.sendMessage(chatId, chapterText, {
              parse_mode: "Markdown",
            });
          }
        } catch (err) {
          console.error(
            `Ошибка при ответе на упоминание (chat ${chatId}):`,
            err.message
          );
        }
      }
    });
  });
}

module.exports = { setupVerseMentionHandler };
