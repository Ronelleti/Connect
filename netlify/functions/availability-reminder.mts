// Netlify scheduled function: every Sunday at 06:00 UTC (08:00-09:00 in Israel) it asks
// the app to remind employees who haven't filled in next scheduling week's availability.
// Needs CRON_SECRET set in the Netlify environment variables.
export default async function handler() {
  const siteUrl = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (!siteUrl || !secret) {
    console.error("availability-reminder: URL or CRON_SECRET is not set");
    return;
  }
  const response = await fetch(`${siteUrl}/api/cron/availability-reminder`, {
    method: "POST",
    headers: { "x-cron-secret": secret }
  });
  console.log("availability-reminder:", response.status, await response.text());
}

export const config = {
  schedule: "0 6 * * 0"
};
