export type AchievementRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary"
  | "mythic";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
  rarity: AchievementRarity;
}

export const RARITY_ORDER: AchievementRarity[] = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];

export const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
  mythic: "Mythic",
};

export const ACHIEVEMENTS: AchievementDef[] = [
  // Common — trivial first-time actions
  {
    id: "first_focus",
    title: "First Focus",
    description: "Complete your first focus session",
    emoji: "📚",
    rarity: "common",
  },
  {
    id: "first_nook",
    title: "Nook Maker",
    description: "Create your first study nook",
    emoji: "🏠",
    rarity: "common",
  },
  {
    id: "seat_claimer",
    title: "Seat Claimer",
    description: "Pick your seat in a nook",
    emoji: "🪑",
    rarity: "common",
  },
  {
    id: "first_chat",
    title: "First Whisper",
    description: "Send your first message in a nook",
    emoji: "💭",
    rarity: "common",
  },
  {
    id: "welcome_aboard",
    title: "Welcome Aboard",
    description: "Join your first study nook",
    emoji: "🚪",
    rarity: "common",
  },
  // Uncommon — light social & early habits
  {
    id: "study_buddy",
    title: "Study Buddy",
    description: "Study in a room with a friend",
    emoji: "👯",
    rarity: "uncommon",
  },
  {
    id: "chatterbox",
    title: "Chatterbox",
    description: "Send 5 messages in nooks",
    emoji: "💬",
    rarity: "uncommon",
  },
  {
    id: "night_owl",
    title: "Night Owl",
    description: "Complete a session after 10 PM",
    emoji: "🦉",
    rarity: "uncommon",
  },
  {
    id: "early_bird",
    title: "Early Bird",
    description: "Complete a session before 7 AM",
    emoji: "🐦",
    rarity: "uncommon",
  },
  {
    id: "weekend_warrior",
    title: "Weekend Warrior",
    description: "Complete a session on a weekend",
    emoji: "🌤️",
    rarity: "uncommon",
  },
  {
    id: "streak_spark",
    title: "Spark of Habit",
    description: "Reach a 3-day study streak",
    emoji: "🔥",
    rarity: "uncommon",
  },
  // Rare — sustained effort
  {
    id: "ten_sessions",
    title: "Ten to Table",
    description: "Complete 10 focus sessions",
    emoji: "🔟",
    rarity: "rare",
  },
  {
    id: "marathon",
    title: "Marathon",
    description: "Accumulate 5 hours of total focus",
    emoji: "🏃",
    rarity: "rare",
  },
  {
    id: "room_host",
    title: "Super Host",
    description: "Create 3 study nooks",
    emoji: "✨",
    rarity: "rare",
  },
  {
    id: "cozy_regular",
    title: "Cozy Regular",
    description: "Complete 3 sessions in one week",
    emoji: "☕",
    rarity: "rare",
  },
  {
    id: "streak_week",
    title: "Week on Fire",
    description: "Reach a 7-day study streak",
    emoji: "🔥",
    rarity: "rare",
  },
  // Epic — significant milestones
  {
    id: "deep_focus",
    title: "Deep Focus",
    description: "Finish a 45+ minute focus session",
    emoji: "🧠",
    rarity: "epic",
  },
  {
    id: "daily_grind",
    title: "Daily Grind",
    description: "Log 60+ minutes of focus in one day",
    emoji: "⏳",
    rarity: "epic",
  },
  {
    id: "social_explorer",
    title: "Social Explorer",
    description: "Join 5 different study nooks",
    emoji: "🤝",
    rarity: "epic",
  },
  {
    id: "quarter_century",
    title: "Quarter Century",
    description: "Complete 25 focus sessions",
    emoji: "🎯",
    rarity: "epic",
  },
  {
    id: "streak_fortnight",
    title: "Fortnight Flame",
    description: "Reach a 14-day study streak",
    emoji: "🔥",
    rarity: "epic",
  },
  {
    id: "hello_library",
    title: "Hello, Nook",
    description: "Send 25 messages in nooks",
    emoji: "📣",
    rarity: "epic",
  },
  // Legendary — major dedication
  {
    id: "focus_veteran",
    title: "Focus Veteran",
    description: "Accumulate 25 hours of total focus",
    emoji: "🎖️",
    rarity: "legendary",
  },
  {
    id: "weekly_champion",
    title: "Weekly Champion",
    description: "Complete 7 sessions in one week",
    emoji: "👑",
    rarity: "legendary",
  },
  {
    id: "century_whispers",
    title: "Century of Whispers",
    description: "Send 100 messages in nooks",
    emoji: "📜",
    rarity: "legendary",
  },
  {
    id: "grand_librarian",
    title: "Grand Librarian",
    description: "Create 5 study nooks",
    emoji: "📖",
    rarity: "legendary",
  },
  {
    id: "streak_month",
    title: "Month of Dedication",
    description: "Reach a 30-day study streak",
    emoji: "🔥",
    rarity: "legendary",
  },
  // Mythic — truly hard
  {
    id: "perfect_month",
    title: "Perfect Month",
    description: "Study every day for 30 days straight",
    emoji: "🌟",
    rarity: "mythic",
  },
  {
    id: "session_century",
    title: "Session Century",
    description: "Complete 100 focus sessions",
    emoji: "💫",
    rarity: "mythic",
  },
  {
    id: "half_century_hours",
    title: "Half-Century Scholar",
    description: "Accumulate 50 hours of total focus",
    emoji: "🏆",
    rarity: "mythic",
  },
  {
    id: "lifetime_scholar",
    title: "Lifetime Scholar",
    description: "Accumulate 365 hours of total focus",
    emoji: "🌈",
    rarity: "mythic",
  },
  {
    id: "streak_century",
    title: "Century Flame",
    description: "Reach a 100-day study streak",
    emoji: "🔥",
    rarity: "mythic",
  },
];

export function getAchievementDef(id: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

export function getHighestEarnedRarity(
  earnedIds: Iterable<string>
): AchievementRarity | null {
  const earned = new Set(earnedIds);
  for (let i = RARITY_ORDER.length - 1; i >= 0; i--) {
    const rarity = RARITY_ORDER[i];
    if (ACHIEVEMENTS.some((a) => a.rarity === rarity && earned.has(a.id))) {
      return rarity;
    }
  }
  return null;
}

export function getRarityStyles(rarity: AchievementRarity): {
  sectionBorder: string;
  sectionBadge: string;
  cardBorder: string;
  cardBadge: string;
  cardGlow: string;
} {
  switch (rarity) {
    case "common":
      return {
        sectionBorder: "border-sage/40",
        sectionBadge: "bg-sage/30 text-brown/80",
        cardBorder: "border-sage/50",
        cardBadge: "bg-sage/25 text-brown/70",
        cardGlow: "",
      };
    case "uncommon":
      return {
        sectionBorder: "border-teal-300/50",
        sectionBadge: "bg-teal-100/80 text-teal-800",
        cardBorder: "border-teal-300/60",
        cardBadge: "bg-teal-100/70 text-teal-800",
        cardGlow: "",
      };
    case "rare":
      return {
        sectionBorder: "border-sky/60",
        sectionBadge: "bg-sky/30 text-brown",
        cardBorder: "border-sky/70",
        cardBadge: "bg-sky/25 text-brown",
        cardGlow: "",
      };
    case "epic":
      return {
        sectionBorder: "border-peach/50",
        sectionBadge: "bg-gradient-to-r from-peach/30 to-purple-200/40 text-brown",
        cardBorder: "border-peach/60",
        cardBadge: "bg-gradient-to-r from-peach/25 to-purple-100/50 text-brown",
        cardGlow: "shadow-[0_0_20px_rgba(244,169,138,0.15)]",
      };
    case "legendary":
      return {
        sectionBorder: "border-amber/70",
        sectionBadge: "bg-amber/40 text-brown",
        cardBorder: "border-amber/80",
        cardBadge: "bg-amber/35 text-brown",
        cardGlow: "shadow-[0_0_24px_rgba(255,216,155,0.25)]",
      };
    case "mythic":
      return {
        sectionBorder: "border-rose/60",
        sectionBadge: "bg-gradient-to-r from-rose/40 to-peach/30 text-brown animate-shimmer",
        cardBorder: "border-rose/70",
        cardBadge: "bg-gradient-to-r from-rose/35 to-peach/25 text-brown animate-shimmer",
        cardGlow: "shadow-[0_0_28px_rgba(232,160,191,0.3)]",
      };
  }
}
