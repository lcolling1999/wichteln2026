import { DatabaseSync } from 'node:sqlite';
import { runTransaction } from './database.js';

export interface KeywordItem {
  word: string;
  emoji: string;
}

export interface ColleagueSeedItem {
  name: string;
  sentence: string;
  keywords: KeywordItem[];
}

export const SEED_COLLEAGUES: ColleagueSeedItem[] = [
  {
    name: 'Lada',
    sentence: 'Organisiert alles mit Bravour und zaubert stets ein Lächeln hervor!',
    keywords: [{ word: 'Bravour', emoji: '✨' }, { word: 'Lächeln', emoji: '😊' }],
  },
  {
    name: 'Sara',
    sentence: 'Bringt Sonnenschein ins Büro und hat immer die besten Ideen parat!',
    keywords: [{ word: 'Sonnenschein', emoji: '☀️' }, { word: 'Ideen', emoji: '💡' }],
  },
  {
    name: 'Norman',
    sentence: 'Behält selbst im größten Trubel den kühlen Kopf und rockt jedes Projekt!',
    keywords: [{ word: 'Trubel', emoji: '🌪️' }, { word: 'rockt', emoji: '🎸' }],
  },
  {
    name: 'Norbert',
    sentence: 'Mit meisterhafter Präzision und unendlicher Ruhe löst er jedes Problem!',
    keywords: [{ word: 'Präzision', emoji: '🎯' }, { word: 'Ruhe', emoji: '🧘' }],
  },
  {
    name: 'Thomas',
    sentence: 'Der verlässliche Fels in der Brandung, wenn Deadlines näher rücken!',
    keywords: [{ word: 'Fels', emoji: '⛰️' }, { word: 'Deadlines', emoji: '⏰' }],
  },
  {
    name: 'Marco',
    sentence: 'Schüttelt geniale Lösungen aus dem Ärmel und liebt guten Kaffee!',
    keywords: [{ word: 'Lösungen', emoji: '🚀' }, { word: 'Kaffee', emoji: '☕' }],
  },
  {
    name: 'Julia',
    sentence: 'Ein Herz aus Gold, immer hilfsbereit und voller kreativer Energie!',
    keywords: [{ word: 'Gold', emoji: '💛' }, { word: 'kreativer', emoji: '🎨' }],
  },
  {
    name: 'Kristoph',
    sentence: 'Mit Scharfsinn und Leidenschaft immer auf der Jagd nach Perfektion!',
    keywords: [{ word: 'Scharfsinn', emoji: '🔍' }, { word: 'Perfektion', emoji: '🏆' }],
  },
  {
    name: 'Jana',
    sentence: 'Versprüht beste Laune im Team und hat stets ein offenes Ohr!',
    keywords: [{ word: 'Laune', emoji: '🎉' }, { word: 'Ohr', emoji: '👂' }],
  },
  {
    name: 'Saman',
    sentence: 'Tüftelt mit Begeisterung und meistert die kniffligsten Rätsel!',
    keywords: [{ word: 'Tüftelt', emoji: '⚙️' }, { word: 'Rätsel', emoji: '🧩' }],
  },
  {
    name: 'Susana',
    sentence: 'Begeistert mit Charme und Weitblick bei jeder neuen Herausforderung!',
    keywords: [{ word: 'Charme', emoji: '✨' }, { word: 'Weitblick', emoji: '🔭' }],
  },
  {
    name: 'Ronny',
    sentence: 'Schnell wie der Blitz und immer für einen flotten Spruch zu haben!',
    keywords: [{ word: 'Blitz', emoji: '⚡' }, { word: 'Spruch', emoji: '😄' }],
  },
  {
    name: 'Lucas',
    sentence: 'Architekt eleganter Lösungen und treuer Hüter der Systemstabilität!',
    keywords: [{ word: 'Architekt', emoji: '🏛️' }, { word: 'Stabilität', emoji: '🛡️' }],
  },
  {
    name: 'Carolin',
    sentence: 'Bringt frischen Wind ins Team und strukturiert jedes Chaos!',
    keywords: [{ word: 'Wind', emoji: '🍃' }, { word: 'Chaos', emoji: '📋' }],
  },
  {
    name: 'Marcel',
    sentence: 'Immer am Puls der Technik und mit vollem Einsatz bei der Sache!',
    keywords: [{ word: 'Puls', emoji: '💓' }, { word: 'Einsatz', emoji: '🔥' }],
  },
  {
    name: 'Tommy',
    sentence: 'Meister der Effizienz und unschlagbar im Teamgeist!',
    keywords: [{ word: 'Effizienz', emoji: '⚡' }, { word: 'Teamgeist', emoji: '🤝' }],
  },
  {
    name: 'Joachim',
    sentence: 'Mit profunder Erfahrung und feinem Humor eine tragende Säule!',
    keywords: [{ word: 'Erfahrung', emoji: '📜' }, { word: 'Humor', emoji: '🎩' }],
  },
  {
    name: 'André',
    sentence: 'Kombiniert analytische Schärfe mit ansteckendem Optimismus!',
    keywords: [{ word: 'Schärfe', emoji: '🗡️' }, { word: 'Optimismus', emoji: '🌟' }],
  },
  {
    name: 'Julian',
    sentence: 'Liebt clevere Details und überrascht mit feinen Einfällen!',
    keywords: [{ word: 'Details', emoji: '💎' }, { word: 'Einfällen', emoji: '💡' }],
  },
  {
    name: 'Eric',
    sentence: 'Ruhig, fokussiert und extrem zielsicher bei allen Aufgaben!',
    keywords: [{ word: 'fokussiert', emoji: '🎯' }, { word: 'zielsicher', emoji: '🏹' }],
  },
  {
    name: 'Andreas',
    sentence: 'Ein unerschütterlicher Stützpfeiler mit Gespür für das Wesentliche!',
    keywords: [{ word: 'Stützpfeiler', emoji: '🏛️' }, { word: 'Wesentliche', emoji: '🧭' }],
  },
  {
    name: 'Damjan',
    sentence: 'Brilliert durch Weitsicht, Tatkraft und erfrischenden Esprit!',
    keywords: [{ word: 'Weitsicht', emoji: '👓' }, { word: 'Tatkraft', emoji: '💪' }],
  },
  {
    name: 'Janek',
    sentence: 'Niemand verbindet Tiefgang und Wortwitz so elegant wie er!',
    keywords: [{ word: 'Tiefgang', emoji: '🌊' }, { word: 'Wortwitz', emoji: '🪄' }],
  },
  {
    name: 'Patrick',
    sentence: 'Immer lösungsorientiert, mitreißend und mit großer Freude dabei!',
    keywords: [{ word: 'lösungsorientiert', emoji: '🚀' }, { word: 'Freude', emoji: '🎁' }],
  },
];

export function seedDatabase(db: DatabaseSync): { participants: number; teasers: number } {
  return runTransaction(db, () => {
    // 1. Initialize draw_status singleton
    db.prepare('INSERT OR IGNORE INTO draw_status (id, is_drawn) VALUES (1, 0);').run();

    const insertParticipant = db.prepare(`
      INSERT INTO participants (name, display_name, normalized_name)
      VALUES (?, ?, ?)
      ON CONFLICT(normalized_name) DO UPDATE SET
        display_name = excluded.display_name
    `);

    const selectParticipant = db.prepare(`
      SELECT id FROM participants WHERE normalized_name = ?
    `);

    const upsertTeaser = db.prepare(`
      INSERT INTO teaser_sentences (participant_id, sentence, keywords_json)
      VALUES (?, ?, ?)
      ON CONFLICT(participant_id) DO UPDATE SET
        sentence = excluded.sentence,
        keywords_json = excluded.keywords_json,
        updated_at = datetime('now')
    `);

    const insertWishList = db.prepare(`
      INSERT OR IGNORE INTO wish_lists (participant_id, content)
      VALUES (?, '')
    `);

    let count = 0;
    for (const item of SEED_COLLEAGUES) {
      const canonicalName = item.name.trim().normalize('NFC');
      const normalizedKey = canonicalName.toLowerCase();

      insertParticipant.run(canonicalName, canonicalName, normalizedKey);
      const row = selectParticipant.get(normalizedKey) as { id: number };

      upsertTeaser.run(row.id, item.sentence, JSON.stringify(item.keywords));
      insertWishList.run(row.id);
      count++;
    }

    return { participants: count, teasers: count };
  });
}

// Standalone execution support
if (process.argv[1] && (import.meta.url.endsWith(process.argv[1]) || process.argv[1].endsWith('seeds.ts') || process.argv[1].endsWith('seeds.js'))) {
  const { getDatabase, closeDatabase } = await import('./database.js');
  const { initializeSchema } = await import('./schema.js');
  const db = getDatabase();
  initializeSchema(db);
  const result = seedDatabase(db);
  console.log(`Pre-seeding completed: ${result.participants} colleagues and teasers seeded.`);
  closeDatabase();
}
