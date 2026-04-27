// GBP automation — high-level helpers built on top of google-api-client.
// All ops require the client to have completed OAuth and have gbp_location_id set.
//
// Usage:
//   import { gbpFor } from "./lib/gbp-automation.mjs";
//   const gbp = await gbpFor(clientId);
//   await gbp.updateCategories({ primary: "categories/gcid:pest_control_service", additional: [...] });
//   await gbp.updateServices([{ displayName: "Rat Removal", price: { ... } }]);
//   await gbp.createPost({ summary: "...", callToAction: { ... } });
//   await gbp.replyToReview(reviewId, "Thanks for the kind words!");

import { getGoogleClient } from "./google-api-client.mjs";

const BIZ_INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const ACCOUNT_MGMT = "https://mybusinessaccountmanagement.googleapis.com/v1";
// Reviews + Posts live on the legacy v4 endpoint
const LEGACY_V4 = "https://mybusiness.googleapis.com/v4";

export async function gbpFor(clientId) {
  const g = await getGoogleClient(clientId);
  if (!g.gbpLocationId) throw new Error("Client has no GBP location linked. Re-run OAuth.");
  if (!g.gbpAccountId) throw new Error("Client has no GBP account linked. Re-run OAuth.");

  const locationName = g.gbpLocationId; // e.g. "locations/123"
  const accountName = g.gbpAccountId;   // e.g. "accounts/456"
  // v4 paths use account/{id}/locations/{id}
  const v4Path = `${accountName}/${locationName}`;

  return {
    raw: g,

    // --- READ helpers ---
    async getProfile(readMask = "name,title,categories,phoneNumbers,websiteUri,regularHours,profile,storefrontAddress,serviceArea,labels") {
      return g.fetchJson(`${BIZ_INFO}/${locationName}?readMask=${encodeURIComponent(readMask)}`);
    },

    async listCategories(regionCode = "US", languageCode = "en") {
      return g.fetchJson(`${BIZ_INFO}/categories?regionCode=${regionCode}&languageCode=${languageCode}&view=BASIC&pageSize=200`);
    },

    async searchCategories(searchTerm, regionCode = "US", languageCode = "en") {
      const q = encodeURIComponent(searchTerm);
      return g.fetchJson(`${BIZ_INFO}/categories:search?regionCode=${regionCode}&languageCode=${languageCode}&searchTerm=${q}&view=BASIC&pageSize=20`);
    },

    // --- WRITE — categories, services, description, hours ---
    async updateCategories({ primary, additional = [] }) {
      const body = {
        categories: {
          primaryCategory: { name: primary },
          additionalCategories: additional.map((name) => ({ name })),
        },
      };
      return g.fetchJson(`${BIZ_INFO}/${locationName}?updateMask=categories`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    async updateDescription(description) {
      const body = { profile: { description } };
      return g.fetchJson(`${BIZ_INFO}/${locationName}?updateMask=profile.description`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    async updateHours(periods) {
      // periods = [{ openDay: "MONDAY", openTime: { hours: 9 }, closeDay: "MONDAY", closeTime: { hours: 17 } }, ...]
      const body = { regularHours: { periods } };
      return g.fetchJson(`${BIZ_INFO}/${locationName}?updateMask=regularHours`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    async updateServiceArea(places) {
      const body = { serviceArea: { businessType: "CUSTOMER_LOCATION_ONLY", places: { placeInfos: places } } };
      return g.fetchJson(`${BIZ_INFO}/${locationName}?updateMask=serviceArea`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    async updateServices(services) {
      // services = [{ displayName: "...", price: { currencyCode: "USD", units: "150" }, description: "..." }]
      const body = { serviceItems: services.map((s) => ({ freeFormServiceItem: s })) };
      return g.fetchJson(`${BIZ_INFO}/${locationName}?updateMask=serviceItems`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },

    // --- POSTS (v4) ---
    // type: STANDARD | EVENT | OFFER | ALERT
    async createPost({ summary, type = "STANDARD", callToAction, media, event, offer }) {
      const body = {
        languageCode: "en-US",
        summary,
        topicType: type,
      };
      if (callToAction) body.callToAction = callToAction;
      if (media) body.media = media; // [{ mediaFormat: "PHOTO", sourceUrl: "https://..." }]
      if (event) body.event = event;
      if (offer) body.offer = offer;

      return g.fetchJson(`${LEGACY_V4}/${v4Path}/localPosts`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async listPosts(pageSize = 20) {
      return g.fetchJson(`${LEGACY_V4}/${v4Path}/localPosts?pageSize=${pageSize}`);
    },

    async deletePost(postId) {
      return g.fetchJson(`${LEGACY_V4}/${v4Path}/localPosts/${postId}`, { method: "DELETE" });
    },

    // --- PHOTOS / MEDIA ---
    async uploadPhoto(sourceUrl, category = "ADDITIONAL") {
      // category: COVER | PROFILE | LOGO | ADDITIONAL | EXTERIOR | INTERIOR | TEAM | etc
      const body = {
        mediaFormat: "PHOTO",
        locationAssociation: { category },
        sourceUrl,
      };
      return g.fetchJson(`${LEGACY_V4}/${v4Path}/media`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },

    async listPhotos(pageSize = 100) {
      return g.fetchJson(`${LEGACY_V4}/${v4Path}/media?pageSize=${pageSize}`);
    },

    // --- REVIEWS ---
    async listReviews(pageSize = 50) {
      return g.fetchJson(`${LEGACY_V4}/${v4Path}/reviews?pageSize=${pageSize}&orderBy=updateTime desc`);
    },

    async replyToReview(reviewId, comment) {
      // reviewId is the resource name OR the bare id. Build the path either way.
      const path = reviewId.includes("/") ? reviewId : `${v4Path}/reviews/${reviewId}`;
      return g.fetchJson(`${LEGACY_V4}/${path}/reply`, {
        method: "PUT",
        body: JSON.stringify({ comment }),
      });
    },

    async deleteReply(reviewId) {
      const path = reviewId.includes("/") ? reviewId : `${v4Path}/reviews/${reviewId}`;
      return g.fetchJson(`${LEGACY_V4}/${path}/reply`, { method: "DELETE" });
    },

    // --- INSIGHTS (Performance API) ---
    // metrics: BUSINESS_IMPRESSIONS_DESKTOP_MAPS, BUSINESS_IMPRESSIONS_MOBILE_MAPS, CALL_CLICKS, WEBSITE_CLICKS, BUSINESS_DIRECTION_REQUESTS, BUSINESS_CONVERSATIONS, etc.
    async fetchInsights({ metrics, startDate, endDate }) {
      const params = new URLSearchParams();
      metrics.forEach((m) => params.append("dailyMetrics", m));
      params.set("dailyRange.startDate.year", startDate.getFullYear());
      params.set("dailyRange.startDate.month", startDate.getMonth() + 1);
      params.set("dailyRange.startDate.day", startDate.getDate());
      params.set("dailyRange.endDate.year", endDate.getFullYear());
      params.set("dailyRange.endDate.month", endDate.getMonth() + 1);
      params.set("dailyRange.endDate.day", endDate.getDate());
      return g.fetchJson(`https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`);
    },
  };
}
