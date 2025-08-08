const { 
  getRandomVerse, 
  searchVerse,
  formatVerse,
  formatChapter,
  getStartMessage,
  splitChapterIntoParts
} = require("../utils/bibleUtils");
const { 
  mainReplyKeyboard,
  backToBooksKeyboard,
  testamentInlineKeyboard
} = require("../utils/keyboardUtils");

const { activeUsers, userState, oldTestamentBooks, newTestamentBooks } = require("../config");

function setupMessageHandlers(bot, bibleData, activeUsers) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    activeUsers.add(chatId);
    try {
      await bot.sendMessage(chatId, getStartMessage(), {
        parse_mode: "Markdown",
        ...mainReplyKeyboard,
      });
    } catch (err) {
      console.error(`Ошибка при отправке /start (chat ${chatId}):`, err.message);
    }
  });

  bot.onText(/\/search/, async (msg) => {
    const chatId = msg.chat.id;
    try {
      await bot.sendMessage(
        chatId,
        `🔍 *Поиск по Библии*\n
Введите ваш запрос одним из следующих способов:
• Укажите название книги и номер главы или стиха (например, _Иоанна 3:16_ или _Бытие 1_)
• Или напишите ключевые слова из нужного стиха (например, _возлюби ближнего_)

_Вы получите до 5 наиболее подходящих результатов._`,
        {
          parse_mode: "Markdown",
          ...mainReplyKeyboard,
        }
      );
    } catch (err) {
      console.error(`Ошибка при отправке /search (chat ${chatId}):`, err.message);
    }
  });

  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    if (msg.chat.type !== 'private') return;
    const isPrivate = msg.chat.type === 'private';
    activeUsers.add(chatId);

    try {
      if (text === "🙏 Случайный стих") {
        const verse = getRandomVerse(bibleData);
        await bot.sendMessage(chatId, formatVerse(verse), {
          parse_mode: "Markdown",
          ...(isPrivate ? mainReplyKeyboard : {}),
        });
      } else if (text === "📖 Читать Библию") {
        await bot.sendMessage(chatId, "📖 *Выберите Завет:*", {
          parse_mode: "Markdown",
          reply_markup: testamentInlineKeyboard,
        });
      } else if (text === "🔍 Поиск") {
        await bot.sendMessage(
          chatId,
          `🔍 *Поиск по Библии*\n
Введите ваш запрос одним из следующих способов:
• Укажите название книги и номер главы или стиха (например, _Иоанна 3:16_ или _Бытие 1_)
• Или напишите ключевые слова из нужного стиха (например, _возлюби ближнего_)

_Вы получите до 5 наиболее подходящих результатов._`,
          {
            parse_mode: "Markdown",
            ...(isPrivate ? mainReplyKeyboard : {}),
          }
        );
      } else if (text === "🏠 Главное меню") {
        userState.delete(chatId);
        await bot.sendMessage(chatId, getStartMessage(), {
          parse_mode: "Markdown",
          ...(isPrivate ? mainReplyKeyboard : {}),
        });
      } else if (text === "⬅️ Назад к книгам") {
        const testament = userState.get(chatId) || "old";
        const books = testament === "old" ? oldTestamentBooks : newTestamentBooks;
        await bot.sendMessage(
          chatId,
          testament === "old"
            ? "📜 *Ветхий Завет — выберите книгу:*"
            : "✝️ *Новый Завет — выберите книгу:*",
          {
            parse_mode: "Markdown",
            reply_markup: getBooksInlineKeyboard(books, bibleData),
          }
        );
      } else {
        const me = await bot.getMe();
        if (text.includes(`@${me.username}`)) {
          return;
        }

        const result = searchVerse(text, bibleData);
        if (result) {
          if (Array.isArray(result)) {
            for (const verse of result) {
              await bot.sendMessage(chatId, formatVerse(verse), {
                parse_mode: "Markdown",
                ...(isPrivate ? mainReplyKeyboard : {}),
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
            await bot.sendMessage(chatId, message, {
              parse_mode: "Markdown",
              ...(isPrivate ? mainReplyKeyboard : {}),
            });
          } else if (result.verse) {
            await bot.sendMessage(chatId, formatVerse(result), {
              parse_mode: "Markdown",
              ...(isPrivate ? mainReplyKeyboard : {}),
            });
          } else {
            const chapterText = formatChapter(result.book, result.chapter);
            await bot.sendMessage(chatId, chapterText, {
              parse_mode: "Markdown",
              ...(isPrivate ? mainReplyKeyboard : {}),
            });
          }
        } else if (!["/start", "/search"].includes(text)) {
          await bot.sendMessage(
            chatId,
            '❌ Ничего не найдено. Введите, например, "Иоанна 3:16", "Бытие 1" или просто слово/фразу из стиха.',
            {
              parse_mode: "Markdown",
              ...(isPrivate ? mainReplyKeyboard : {}),
            }
          );
        }
      }
    } catch (err) {
      console.error(
        `Ошибка при обработке сообщения (chat ${chatId}, text: ${text}):`,
        err.message
      );
      await bot.sendMessage(chatId, "Произошла ошибка. Попробуйте снова.");
    }
  });

  bot.onText(/\/hide/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, 'Кнопки скрыты ✅', {
      reply_markup: {
        remove_keyboard: true,
      },
    });
  });
}

module.exports = { setupMessageHandlers };