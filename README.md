# Masjid Sentral — Database Schema

The canonical open database of every masjid, surau, and musolla in Malaysia — and eventually Singapore, Brunei, and Indonesia.

## What is Masjid Sentral?

Masjid Sentral is a community-owned, open data platform that consolidates masjid data from multiple apps into one unified source of truth. It is built and maintained jointly by [Jejak Masjid](https://jejakmasjid.my) and [Qiyam](https://qiyam.catchupmobility.com), and is open to any developer who wants to build on top of it.

## Goals

- One canonical, deduplicated database of all masjids in Malaysia
- Public REST API — read without authentication, write requires an API key
- Community-maintained — any app or developer can contribute data
- Extensible — events, reviews, facilities, prayer times, and more

## Tech Stack

| Layer | Technology |
|---|---|
| Database | Cloudflare D1 (SQLite) |
| API | Cloudflare Workers + Hono |
| Schema migrations | Raw SQL in `migrations/` |

## Repository Structure

```
migrations/
  001_initial.sql    — full schema + reference data seed
```

## Schema Overview

### Reference Tables
| Table | Purpose |
|---|---|
| `countries` | MY, SG, BN, ID |
| `states` | States and territories |
| `cities` | Cities and towns |
| `masjid_types` | masjid, surau, musolla |

### Core Table
| Table | Purpose |
|---|---|
| `masjids` | Every prayer venue — the single source of truth |

### Extended Tables
| Table | Purpose |
|---|---|
| `masjid_images` | Photos |
| `masjid_facilities` | Facility tags (parking, wudhu, wheelchair…) |
| `masjid_contacts` | Social media links |
| `masjid_reviews` | Star ratings and written reviews |
| `masjid_events` | Events and activities with recurrence support |
| `masjid_event_images` | Event photos |

## Running Migrations

### Prerequisites
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed
- A Cloudflare D1 database named `masjidsentral`

### Apply migrations

```bash
# Local (development)
wrangler d1 execute masjidsentral --local --file=migrations/001_initial.sql

# Remote (production)
wrangler d1 execute masjidsentral --remote --file=migrations/001_initial.sql
```

## Contributing

We welcome contributions from the community:

- **Data corrections** — open an issue or submit a PR with updated records
- **New masjids** — use the API (API key required) or open a PR adding to the seed data
- **Schema changes** — open an issue for discussion before submitting a PR; schema changes require agreement from both maintainers

## Maintainers

- [Jejak Masjid](https://github.com/jejakmasjid)
- [Qiyam](https://github.com/masjidsentral)

## License

- **Code:** MIT License
- **Data:** [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/) — free to use, share, and adapt with attribution
