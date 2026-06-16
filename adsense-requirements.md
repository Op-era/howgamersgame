# Google AdSense Approval Requirements
## HowGamersGame — howgamersgame.online

**Status as of:** June 16, 2025  
**Entity:** Haven Command LLC  
**AdSense Publisher ID:** pending approval

---

## Summary

Google AdSense evaluates sites against content quality, navigability, policy compliance, and traffic legitimacy. The checklist below maps each official rejection category to concrete, actionable requirements for this site.

---

## 1. Legal Pages (Required — blocking)

AdSense requires a **Privacy Policy** that explicitly discloses use of Google advertising cookies. Without it, approval is near-impossible.

| Page | URL | Status | Notes |
|------|-----|--------|-------|
| Privacy Policy | `/privacy` | ✅ Built | Must mention Google AdSense cookies and opt-out link |
| Terms of Service | `/terms` | ✅ Built | Covers coins, subscriptions, user conduct |
| About | `/about` | ✅ Built | Explains platform purpose, coin economy, games |
| Contact | `/contact` | ✅ Built | Form + email, response time stated |

**Privacy Policy must include:**
- Statement that Google AdSense uses cookies to serve personalized ads
- Link to Google's Ads Settings: `https://www.google.com/settings/ads`
- Statement that users can opt out via the NAI opt-out page
- Disclosure of all cookies used (session, analytics, advertising)
- Data retention policy and user rights (access, deletion, portability)
- Contact information for data requests

---

## 2. Content Requirements

Google reviewers read the actual content, not just the homepage. These thresholds are approximate based on known approval patterns.

### Minimum content targets

| Item | Requirement | Current State | Action |
|------|-------------|---------------|--------|
| Site pages with text | 10+ unique pages | ~8 (incl. legal) | Add game description pages |
| Words per page | 300+ words of original text | Variable | Each game needs a dedicated page with description |
| Game library pages | 1 page per game | 0 dedicated pages | Create `/games/[slug]` route with full descriptions |
| Blog / news section | 5–10 posts recommended | None | Add `/blog` with game updates and platform news |
| Navigation links | All pages reachable from nav | About missing | ✅ Fixed — About added to nav |

### Content quality rules

- No auto-generated, duplicate, or thin content (< 100 words per page)
- No affiliate links as the primary content — platform content must come first
- Game pages must have original descriptions, not just a title and iframe
- Do not place AdSense code on pages that are empty, under construction, or login-gated

---

## 3. Site Navigation Requirements

Google must be able to crawl every public page without logging in.

| Requirement | Status | Notes |
|------------|--------|-------|
| Clear nav with links to major sections | ✅ | Header nav has Home, About, Passes, Store, Sign In |
| Footer with Privacy / Terms / Contact | ✅ | All legal pages include footer links |
| No broken links on public pages | Verify | Run link checker before resubmitting |
| No pages behind login walls (for AdSense pages) | ✅ | Game console loads for anonymous users |
| No excessive pop-ups or interstitials | ✅ | No pop-ups on public pages |
| 404 page | Verify | Next.js provides default — consider custom styled page |
| Sitemap | Missing | Add `sitemap.xml` — helps crawlability |
| robots.txt | Missing | Add `robots.txt` allowing Googlebot |

---

## 4. Ad Placement Rules

Once approved, these rules govern where and how ads can appear.

| Rule | Detail |
|------|--------|
| Max ads per page | No fixed cap, but must not overwhelm content |
| Ads near buttons | Ads must not be placed adjacent to clickable game controls in a way that causes accidental clicks |
| Ads inside iframes | Ads cannot be placed inside cross-origin iframes |
| Mobile ad density | On mobile, total ad area should not exceed 30% of screen |
| Ad-free zones | Do not place ads on the game-active screen — place in lobby/score/pre-game areas |
| Subscriber ad-free | If pass holders get ad-free, the ad code must actually be suppressed for them |

---

## 5. Traffic Quality Requirements

AdSense rejects sites with suspicious traffic patterns. This is evaluated continuously after approval too.

| Rule | Notes |
|------|-------|
| No paid-to-click programs | Never send users from PTC/GPT sites to inflate clicks |
| No incentivized ad clicks | Never prompt users to click ads |
| No software-generated traffic | No bots, scrapers, or automated visits to boost numbers |
| No purchased traffic from low-quality sources | Only organic, social, and search traffic |
| No click farms | Applies globally — including any social sharing campaigns |
| Self-clicking | Never click your own ads |

---

## 6. Technical Requirements

| Item | Requirement | Notes |
|------|-------------|-------|
| HTTPS | Required | ✅ Vercel provides SSL |
| Page load speed | Fast enough to display content before ads load | Verify with PageSpeed Insights |
| AdSense script placement | In `<head>` or just before `</body>` — not inside game canvas | ✅ In `layout.tsx` head |
| Publisher ID env var | `NEXT_PUBLIC_ADSENSE_PUBLISHER_ID` | Set in Vercel environment variables |
| Ad slot ID | One slot per ad unit type | Create in AdSense dashboard, set as `VITE_ADSENSE_SLOT_ID` |
| `ca-pub-XXXXXXX` format | Publisher ID must match exactly | |

---

## 7. Recommended Pre-Submission Checklist

Run through this before resubmitting to AdSense:

- [ ] Privacy Policy is live at `/privacy` with Google AdSense disclosure
- [ ] Terms of Service is live at `/terms`
- [ ] About page is live at `/about` with 300+ words
- [ ] Contact page is live at `/contact`
- [ ] Each game has its own page with a 300+ word original description
- [ ] At least one blog/news post exists
- [ ] All nav links resolve without errors
- [ ] No pages require login to access (except user profile/settings)
- [ ] `sitemap.xml` is generated and submitted to Google Search Console
- [ ] `robots.txt` allows Googlebot
- [ ] Site is indexed in Google Search Console (verify with Search Console)
- [ ] PageSpeed score is 50+ on mobile
- [ ] AdSense publisher script is in `<head>` of every page
- [ ] No duplicate AdSense account exists under the same payee info

---

## 8. Post-Approval Ongoing Compliance

Accounts can be suspended after approval for policy violations.

| Rule | Detail |
|------|--------|
| Update Privacy Policy | Any new data collection must be disclosed promptly |
| Monitor Invalid Traffic | Watch AdSense dashboard for traffic quality warnings |
| No policy pages behind login | Legal pages must always be publicly accessible |
| Children's content | If any game targets under-13, must use non-personalized ads (COPPA/CARU) |
| Content changes | If site content changes significantly, re-review against policies |

---

## Reference Links

- [AdSense Program Policies](https://support.google.com/adsense/answer/48182)
- [Better Ads Standards](https://www.betterads.org/standards/)
- [Google Ads Settings (opt-out)](https://www.google.com/settings/ads)
- [NAI Opt-Out](https://optout.networkadvertising.org/)
- [Google Privacy Policy Partners](https://www.google.com/policies/privacy/partners)
- [AdSense Help — Account Not Approved](https://support.google.com/adsense/answer/10527938)
- [Google Search Console](https://search.google.com/search-console)
- [PageSpeed Insights](https://pagespeed.web.dev/)
