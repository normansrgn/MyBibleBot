// Темы для стихов
const VERSE_THEMES = {
  encouragement: ['вера', 'надежда', 'утешение', 'ободрение', 'сила'],
  wisdom: ['мудрость', 'разум', 'знание', 'понимание', 'совет'],
  love: ['любовь', 'милосердие', 'доброта', 'сострадание', 'прощение'],
  peace: ['мир', 'покой', 'терпение', 'спокойствие', 'тишина'],
  strength: ['сила', 'крепость', 'опора', 'помощь', 'защита']
};

const BOOK_WEIGHTS = {
  'old': 1,
  'new': 4  // увеличен вес нового завета для большей вероятности выбора
};

// Популярные стихи
const POPULAR_VERSES = [
  { book: 'Иоанна', chapter: 3, verse: 16 },
  { book: 'Иеремия', chapter: 29, verse: 11 },
  { book: 'Филиппийцам', chapter: 4, verse: 13 },
  { book: 'Римлянам', chapter: 8, verse: 28 },
  { book: 'Псалтирь', chapter: 22, verse: 1 },
  { book: 'Притчи', chapter: 3, verse: 5 },
  { book: 'Исаия', chapter: 41, verse: 10 },
  { book: 'Матфея', chapter: 11, verse: 28 }
];

function getRandomVerse(bibleData) {
  const book = bibleData[Math.floor(Math.random() * bibleData.length)];
  const chapterIndex = Math.floor(Math.random() * book.chapters.length);
  const chapter = book.chapters[chapterIndex];
  const verseIndex = Math.floor(Math.random() * chapter.length);
  return {
    bookName: book.name,
    chapter: chapterIndex + 1,
    verse: verseIndex + 1,
    text: chapter[verseIndex],
  };
}

function getMeaningfulVerse(bibleData, theme = null) {
  // 30% chance to get popular verse
  if (Math.random() < 0.3 && POPULAR_VERSES.length > 0) {
    const popular = POPULAR_VERSES[Math.floor(Math.random() * POPULAR_VERSES.length)];
    const book = bibleData.find(b => b.name.includes(popular.book));
    if (book) {
      const verseText = book.chapters[popular.chapter-1]?.[popular.verse-1];
      if (verseText) {
        return {
          bookName: book.name,
          chapter: popular.chapter,
          verse: popular.verse,
          text: verseText,
          isPopular: true
        };
      }
    }
  }

  // Select testament based on weights
  const testament = Math.random() < BOOK_WEIGHTS.new/(BOOK_WEIGHTS.old + BOOK_WEIGHTS.new) ? 
    bibleData.slice(bibleData.findIndex(b => b.name.toLowerCase() === "от матфея")) : 
    bibleData.slice(0, bibleData.findIndex(b => b.name.toLowerCase() === "от матфея"));

  // Filter by theme if provided
  let filteredBooks = testament;
  if (theme) {
    const themeKeywords = VERSE_THEMES[theme] || [];
    filteredBooks = testament.filter(book => {
      return book.chapters.some(chapter => 
        chapter.some(verse => 
          themeKeywords.some(keyword => 
            verse.toLowerCase().includes(keyword)
          )
        )
      );
    });
    
    if (filteredBooks.length === 0) {
      filteredBooks = testament;
    }
  }

  // Select random book from filtered
  const book = filteredBooks[Math.floor(Math.random() * filteredBooks.length)];
  
  // Select random chapter with at least 3 verses
  let chapterIndex, chapter;
  do {
    chapterIndex = Math.floor(Math.random() * book.chapters.length);
    chapter = book.chapters[chapterIndex];
  } while (chapter.length < 3);

  // Select meaningful verse (not too short, not too long, ends with punctuation, not generic)
  let verseIndex, verseText;
  do {
    verseIndex = Math.floor(Math.random() * chapter.length);
    verseText = chapter[verseIndex];
  } while (
    verseText.length < 20 ||
    verseText.length > 100 ||
    /[^.?!]$/.test(verseText.trim()) ||
    /и пош[её]л|и приш[её]л|и сказал|и говор[иы]л/i.test(verseText)
  );

  const contextStart = Math.max(0, verseIndex - 1);
  const contextEnd = Math.min(chapter.length, verseIndex + 2);
  const contextText = chapter.slice(contextStart, contextEnd).join(" ");

  return {
    bookName: book.name,
    chapter: chapterIndex + 1,
    verse: verseIndex + 1,
    text: contextText,
    isPopular: false
  };
}

function formatVerse({ bookName, chapter, verse, text, isPopular = false }) {
  const formattedText = text
    .split("\n")
    .map(line => `_${line.trim()}_`)
    .join("\n");

  return `${formattedText}\n\n${bookName} ${chapter}:${verse}${/[.?!…]$/.test(formattedText.trim()) ? '' : '.'}`;
}

function splitChapterIntoParts(book, chapterNumber) {
  const chapterIndex = chapterNumber - 1;
  if (!book || !book.chapters[chapterIndex]) return [];

  const verses = book.chapters[chapterIndex];
  const parts = [];
  let currentPart = `📖 *${book.name}* — глава ${chapterNumber}\n\n`;

  for (let i = 0; i < verses.length; i++) {
    const line = `${i + 1}. ${verses[i]}\n`;
    if ((currentPart + line).length > 4000) {
      parts.push(currentPart.trim());
      currentPart = "";
    }
    currentPart += line;
  }

  if (currentPart) parts.push(currentPart.trim());
  return parts;
}

function normalizeBookName(name) {
  return name.toLowerCase().replace(/\s+/g, "");
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function findClosestBookName(inputName, bibleData) {
  const normalizedInput = normalizeBookName(inputName);
  let closestBook = null;
  let minDistance = Infinity;

  for (const book of bibleData) {
    const normalizedBook = normalizeBookName(book.name);
    const distance = levenshtein(normalizedInput, normalizedBook);
    if (distance < minDistance) {
      minDistance = distance;
      closestBook = book;
    }
  }

  return minDistance <= 5 ? closestBook : null;
}

function searchVerse(query, bibleData) {
  const regex = /^(\d?\s*[а-яА-ЯёЁ\s]+)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i;
  const match = query.match(regex);

  if (match) {
    let [, bookNameRaw, chapterStr, verseStr, verseEndStr] = match;
    const bookName = normalizeBookName(bookNameRaw);
    const chapter = parseInt(chapterStr, 10);
    const verse = verseStr ? parseInt(verseStr, 10) : null;
    const verseEnd = verseEndStr ? parseInt(verseEndStr, 10) : null;

    let book = bibleData.find(
      (b) =>
        normalizeBookName(b.name) === bookName ||
        normalizeBookName(b.name).includes(bookName)
    );

    if (!book) {
      book = findClosestBookName(bookName, bibleData);
    }
    if (!book) return null;

    const chapterIndex = chapter - 1;
    const chapterData = book.chapters[chapterIndex];
    if (!chapterData) return null;

    if (verse && verseEnd) {
      const verses = chapterData.slice(verse - 1, verseEnd);
      if (!verses.length) return null;
      return {
        bookName: book.name,
        chapter,
        verses: verses.map((text, i) => ({
          verse: verse + i,
          text,
        })),
      };
    }

    if (verse) {
      const verseIndex = verse - 1;
      const text = chapterData[verseIndex];
      if (!text) return null;
      return {
        bookName: book.name,
        chapter,
        verse,
        text,
      };
    }

    return {
      book: book,
      chapter: chapter,
    };
  }

  const results = [];
  for (const book of bibleData) {
    for (let i = 0; i < book.chapters.length; i++) {
      const chapter = book.chapters[i];
      for (let j = 0; j < chapter.length; j++) {
        const verseText = chapter[j];
        if (verseText.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            bookName: book.name,
            chapter: i + 1,
            verse: j + 1,
            text: verseText,
          });
          if (results.length >= 5) return results;
        }
      }
    }
  }

  return results.length ? results : null;
}

function formatChapter(book, chapterNumber) {
  const parts = splitChapterIntoParts(book, chapterNumber);
  return parts[0] || "Глава не найдена.";
}

function getStartMessage() {
  return `🌿 Добро пожаловать, ищущий света! 🌿

📜 "Слово Твое — светильник ноге моей и свет стезе моей." (Псалтирь 118:105)

Этот бот — ваш спутник в путешествии по Священному Писанию. Здесь вы можете:
🌟 Находить вдохновение в случайных стихах
📜 Погружаться в чтение Библии по главам
🔍 Искать конкретные стихи, чтобы прикоснуться к Божьему Слову

Пусть ваше сердце наполнится миром! Выберите действие ниже:`;
}

module.exports = {
  getRandomVerse,
  getMeaningfulVerse,
  searchVerse,
  formatVerse,
  formatChapter,
  splitChapterIntoParts,
  normalizeBookName,
  levenshtein,
  findClosestBookName,
  getStartMessage,
  VERSE_THEMES
};