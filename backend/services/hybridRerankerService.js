function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeByRange(value, min, max) {
  if (!Number.isFinite(value)) return 0;
  if (max <= min) return value > 0 ? 1 : 0;
  return clamp((value - min) / (max - min));
}

function rangeFor(items, selector) {
  const values = items.map(selector).map(Number).filter(Number.isFinite);
  return {
    min: values.length ? Math.min(...values) : 0,
    max: values.length ? Math.max(...values) : 0,
  };
}

function qualityScore(candidate, maxViews) {
  const rating = clamp(Number(candidate.profile?.imdb_rating) / 10);
  const views = Math.log10((Number(candidate.profile?.views) || 0) + 1);
  const normalizedViews = maxViews > 0 ? clamp(views / maxViews) : 0;
  return rating * 0.7 + normalizedViews * 0.3;
}

function getRerankerConfig() {
  return {
    poolSize: Math.max(12, Math.min(100, Number(process.env.HYBRID_RERANK_POOL_SIZE) || 40)),
    baseWeight: clamp(process.env.HYBRID_RERANK_BASE_WEIGHT || 0.52),
    denseWeight: clamp(process.env.HYBRID_RERANK_DENSE_WEIGHT || 0.30),
    tasteWeight: clamp(process.env.HYBRID_RERANK_TASTE_WEIGHT || 0.08),
    engagementWeight: clamp(process.env.HYBRID_RERANK_ENGAGEMENT_WEIGHT || 0.07),
    qualityWeight: clamp(process.env.HYBRID_RERANK_QUALITY_WEIGHT || 0.03),
  };
}

function buildRerankPool(candidates, poolSize) {
  const byBase = [...candidates].sort((left, right) => right.score - left.score).slice(0, poolSize);
  const byDense = [...candidates]
    .filter((item) => Number.isFinite(item.denseSimilarity))
    .sort((left, right) => right.denseSimilarity - left.denseSimilarity)
    .slice(0, poolSize);
  const pool = new Map();
  [...byBase, ...byDense].forEach((item) => pool.set(Number(item.profile.id), item));
  return [...pool.values()];
}

function rerankCandidates(candidates, {
  denseAvailable = false,
  engagementScores = new Map(),
  limit = 12,
} = {}) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const hasEngagement = engagementScores instanceof Map && engagementScores.size > 0;
  if (!denseAvailable && !hasEngagement) {
    return [...candidates]
      .sort((left, right) => right.score - left.score || (right.profile?.views || 0) - (left.profile?.views || 0))
      .slice(0, limit)
      .map((item) => ({ ...item, rerankScore: null }));
  }

  const config = getRerankerConfig();
  const pool = buildRerankPool(candidates, config.poolSize);
  const baseRange = rangeFor(pool, (item) => item.score);
  const denseRange = rangeFor(pool, (item) => item.denseSimilarity);
  const tasteRange = rangeFor(pool, (item) => item.tasteScore);
  const maxLogViews = Math.max(...pool.map((item) => Math.log10((Number(item.profile?.views) || 0) + 1)), 0);
  const weights = {
    base: config.baseWeight,
    dense: denseAvailable ? config.denseWeight : 0,
    taste: config.tasteWeight,
    engagement: hasEngagement ? config.engagementWeight : 0,
    quality: config.qualityWeight,
  };
  const weightTotal = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;

  return pool.map((item) => {
    const engagement = engagementScores.get(Number(item.profile.id));
    const components = {
      base: normalizeByRange(item.score, baseRange.min, baseRange.max),
      dense: denseAvailable ? normalizeByRange(item.denseSimilarity, denseRange.min, denseRange.max) : 0,
      taste: normalizeByRange(item.tasteScore, tasteRange.min, tasteRange.max),
      engagement: clamp(typeof engagement === 'object' ? engagement.score : engagement),
      quality: qualityScore(item, maxLogViews),
    };
    const rerankScore = (
      components.base * weights.base
      + components.dense * weights.dense
      + components.taste * weights.taste
      + components.engagement * weights.engagement
      + components.quality * weights.quality
    ) / weightTotal;
    return {
      ...item,
      rerankScore: Number((rerankScore * 100).toFixed(2)),
      rerankComponents: components,
    };
  })
    .sort((left, right) => right.rerankScore - left.rerankScore || right.score - left.score)
    .slice(0, limit);
}

module.exports = {
  getRerankerConfig,
  rerankCandidates,
};
