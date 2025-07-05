const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "activeChats.json");

const endings = [
  "Пусть эти слова принесут твоей душе покой и свет.",
  "Пусть эти слова напомнят о том, что ты любим и не один.",
  "Пусть эти слова станут для тебя тихим утешением в суете дня.",
  "Пусть эти слова согреют твое сердце и укрепят надежду.",
  "Пусть эти слова пробудят веру в тебе, даже если она ослабла.",
  "Пусть эти слова наполнят твой внутренний мир тишиной.",
  "Пусть эти слова вдохновят идти тебя вперёд, несмотря ни на что.",
  "Пусть эти слова станут глотком живой воды для твоей души.",
  "Пусть эти слова напомнят тебе: Бог рядом, даже в молчании.",
  "Пусть эти слова откроют тихую силу Божьего присутствия.",
];

function getRandomVerse(bibleData) {
  if (!Array.isArray(bibleData)) {
    console.error("❌ bibleData не массив");
    return {
      bookName: "Ошибка",
      chapter: 0,
      verse: 0,
      text: "Данные Библии не загружены или повреждены.",
    };
  }

  const validBooks = bibleData.filter(
    (book) => Array.isArray(book.chapters) && book.chapters.length > 0
  );

  if (validBooks.length === 0) {
    return {
      bookName: "Ошибка",
      chapter: 0,
      verse: 0,
      text: "Нет подходящих книг с главами.",
    };
  }

  let attempts = 0;

  while (attempts < 10) {
    const book = validBooks[Math.floor(Math.random() * validBooks.length)];
    const chapterIndex = Math.floor(Math.random() * book.chapters.length);
    const chapter = book.chapters[chapterIndex];
    const verseIndex = Math.floor(Math.random() * chapter.length);
    const verseText = chapter[verseIndex];

    let fullText = verseText;
    let finalVerseIndex = verseIndex;

    if (
      verseText.length < 80 &&
      !/[.!?…]$/.test(verseText.trim()) &&
      verseIndex + 1 < chapter.length
    ) {
      fullText += " " + chapter[verseIndex + 1];
      finalVerseIndex = verseIndex + 1;
    }

    return {
      bookName: book.name,
      chapter: chapterIndex + 1,
      verse: verseIndex + 1,
      text: fullText,
    };
  }

  const fallbackBook = validBooks[0];
  return {
    bookName: fallbackBook.name,
    chapter: 1,
    verse: 1,
    text: fallbackBook.chapters[0][0],
  };
}

function getRandomEnding() {
  return endings[Math.floor(Math.random() * endings.length)];
}

function capitalizeFirstLetter(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatVerse(verse) {
  const capitalizedText = capitalizeFirstLetter(verse.text);

  return `

_"${capitalizedText}"_
_${verse.bookName}_ ${verse.chapter}:${verse.verse}  

🌿 _${getRandomEnding()}_
`.trim();
}

function scheduleGroupVerses(bot, bibleData) {
  let activeChats = new Set();


  const recentUpdates = new Map(); 

  if (fs.existsSync(FILE_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(FILE_PATH, "utf-8"));
      activeChats = new Set(saved);
      console.log(`📂 Загружено ${activeChats.size} чатов из файла`);
    } catch (err) {
      console.error("❌ Ошибка загрузки чатов:", err.message);
    }
  }

  function saveActiveChats() {
    fs.writeFileSync(FILE_PATH, JSON.stringify([...activeChats], null, 2));
  }

  bot.on("my_chat_member", (msg) => {
  const chatId = msg.chat.id;
  const status = msg.new_chat_member?.status;

  if (status === "member" || status === "administrator") {
    if (!activeChats.has(chatId)) {
      activeChats.add(chatId);
      saveActiveChats();
      console.log(`✅ Бот добавлен в чат: ${chatId}`);
    }
  }

  if (status === "left" || status === "kicked") {
    if (activeChats.has(chatId)) {
      activeChats.delete(chatId);
      saveActiveChats();
      console.log(`❌ Бот удалён из чата: ${chatId}`);
    }
  }
});

  function isAllowedHour() {
    const hour = new Date().getHours();
    return hour >= 7 && hour <= 23;
  }

  async function sendVerseToChats(chatIds) {
    for (const chatId of chatIds) {
      try {
        if (!Array.isArray(bibleData)) {
          console.error("❌ В sendVerseToChats bibleData не массив!");
          continue;
        }
        const verse = getRandomVerse(bibleData);
        const message = formatVerse(verse);
        await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        console.log(`✅ Стих отправлен в чат ${chatId}`);
      } catch (err) {
        console.error(`❌ Ошибка отправки в чат ${chatId}:`, err.message);
      }
    }
  }

  async function sendVerseToAllChats(force = false) {
    if (!force && !isAllowedHour()) {
      console.log("🌙 Ночное время — стихи не отправляются");
      return;
    }
    await sendVerseToChats(activeChats);
  }


  cron.schedule("0 */2 * * *", () => {
    console.log("🕒 ⏱ Рассылка раз в 2 часа...");
    sendVerseToAllChats();
  });

  setTimeout(() => {
    console.log("🚀 Первая рассылка после запуска...");
    sendVerseToAllChats(true);
  }, 5000);


  bot.onText(/\/test_verse/, async (msg) => {
    const chatId = msg.chat.id;
    const verse = getRandomVerse(bibleData);
    await bot.sendMessage(chatId, `🧪 *Тестовый стих:*\n\n${formatVerse(verse)}`, {
      parse_mode: "Markdown",
    });
  });

  console.log("📅 Планировщик и авторассылка запущены");
}

module.exports = { scheduleGroupVerses };