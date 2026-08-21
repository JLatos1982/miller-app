function translatedText(value) {
  return value?.translation?.find?.((item) => item.language === "en")?.text || value?.translation?.[0]?.text || ""
}

export function normalizeGtfsRealtimeAlerts(decodedFeed, providerId) {
  return (decodedFeed?.entity || []).filter((entity) => entity.alert).map((entity) => ({
    id: String(entity.id || ""),
    text: translatedText(entity.alert.headerText) || translatedText(entity.alert.descriptionText) || "Transit service alert",
    url: translatedText(entity.alert.url) || null,
    routeIds: (entity.alert.informedEntity || []).map((item) => item.routeId).filter(Boolean),
    activePeriods: (entity.alert.activePeriod || []).map((period) => ({ start: period.start ? Number(period.start) : null, end: period.end ? Number(period.end) : null })),
    providerId,
  }))
}
