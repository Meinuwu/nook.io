import PageHeader from "../components/PageHeader";
import { useAuth } from "../lib/useAuth";
import * as backend from "../lib/mockBackend";
import {
  ACHIEVEMENTS,
  RARITY_LABELS,
  RARITY_ORDER,
  getRarityStyles,
} from "../lib/achievements";

export default function AchievementsPage() {
  const { profile } = useAuth();

  if (!profile) return null;

  const earnedMap = new Map(
    backend.getUserAchievements(profile.userId).map((a) => [a.achievementId, a.earnedAt])
  );

  const grouped = RARITY_ORDER.map((rarity) => ({
    rarity,
    achievements: ACHIEVEMENTS.filter((a) => a.rarity === rarity),
  }));

  return (
    <>
      <PageHeader variant="back" title="Achievements" backTo="/profile" />

      <div className="mx-auto max-w-2xl px-4 pb-6 sm:px-6">
        <h1 className="mb-2 text-2xl font-extrabold text-brown">All badges</h1>
        <p className="mb-8 text-olive">
          {earnedMap.size} of {ACHIEVEMENTS.length} badges earned — keep going!
        </p>

        <div className="flex flex-col gap-10">
          {grouped.map(({ rarity, achievements }) => {
            const styles = getRarityStyles(rarity);
            const earnedInTier = achievements.filter((a) => earnedMap.has(a.id)).length;

            return (
              <section
                key={rarity}
                className={`achievement-section ${styles.sectionBorder}`}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wide bg-[length:200%_200%] ${styles.sectionBadge}`}
                  >
                    {RARITY_LABELS[rarity]}
                  </span>
                  <span className="text-xs font-semibold text-olive/70">
                    {earnedInTier}/{achievements.length}
                  </span>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {achievements.map((a) => {
                    const earnedAt = earnedMap.get(a.id);
                    const unlocked = !!earnedAt;

                    return (
                      <div
                        key={a.id}
                        className={`achievement-card ${styles.cardBorder} ${styles.cardGlow} ${
                          unlocked ? "achievement-card-unlocked" : "achievement-card-locked"
                        }`}
                      >
                        <span className={`text-4xl ${unlocked ? "animate-bob" : ""}`}>
                          {a.emoji}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h3 className="font-extrabold text-brown">{a.title}</h3>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-[length:200%_200%] ${styles.cardBadge}`}
                            >
                              {RARITY_LABELS[a.rarity]}
                            </span>
                          </div>
                          <p className="text-sm text-olive">{a.description}</p>
                          {unlocked && (
                            <p className="mt-1 text-xs font-bold text-peach">
                              Earned {new Date(earnedAt).toLocaleDateString()}
                            </p>
                          )}
                          {!unlocked && (
                            <p className="mt-1 text-xs font-bold text-brown/40">
                              {backend.formatAchievementProgress(
                                backend.getAchievementProgress(profile.userId, a.id)
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </>
  );
}
