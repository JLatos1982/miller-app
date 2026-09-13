const timestamp = (record, field, fallback) => {
  const value = Date.parse(record?.[field] || "")
  return Number.isFinite(value) ? value : fallback
}

export function filterAndSortTreaty6Beta(records = [], filters = {}, sort = "CLOSING_SOON", now = new Date()) {
  const current = new Date(now).getTime()
  return [...records]
    .filter(item => !filters.province || filters.province === "ALL" || item.province.includes(filters.province))
    .filter(item => !filters.action || filters.action === "ALL" || item.actionability === filters.action)
    .filter(item => !filters.category || filters.category === "ALL" || item.categories?.includes(filters.category))
    .filter(item => !filters.relevance || filters.relevance === "ALL" || item.indigenous_relevance_class === filters.relevance)
    .filter(item => !filters.buyer || filters.buyer === "ALL" || item.buyer === filters.buyer)
    .filter(item => !filters.closing_soon || (item.close_date && Date.parse(item.close_date) >= current && Date.parse(item.close_date) - current <= 7 * 86_400_000))
    .sort((a, b) => {
      if (sort === "NEWEST") return timestamp(b, "posted_date", 0) - timestamp(a, "posted_date", 0)
      if (sort === "RECENTLY_CHANGED") return timestamp(b, "last_changed_at", 0) - timestamp(a, "last_changed_at", 0)
      if (sort === "INDIGENOUS_SPECIFIC") return Number(!b.indigenous_relevance_class.startsWith("GENERAL")) - Number(!a.indigenous_relevance_class.startsWith("GENERAL")) || a.title.localeCompare(b.title)
      if (sort === "BUYER") return a.buyer.localeCompare(b.buyer) || a.title.localeCompare(b.title)
      return timestamp(a, "close_date", Number.POSITIVE_INFINITY) - timestamp(b, "close_date", Number.POSITIVE_INFINITY)
    })
}
