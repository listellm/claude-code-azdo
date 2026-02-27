# Publisher Domain Verification — Azure DevOps Marketplace

## Context

The publisher account `listellm` needs a verified domain before the extension can be published
publicly to the Azure DevOps Marketplace. Domain verification is also required to unlock the
verified publisher badge on the Marketplace listing.

Reference: https://code.visualstudio.com/api/working-with-extensions/publishing-extension#verify-a-publisher

---

## What you need from the user before starting

1. **Domain to verify** — a domain they own and can edit DNS records for. Must be:
   - A root domain (not a subdomain like `foo.github.io`)
   - Reachable over HTTPS, returning HTTP 200 to HEAD requests
   - A domain where DNS TXT records can be added (via registrar or DNS provider)
2. **DNS provider access** — find out which provider they use (Cloudflare, Route 53, Namecheap,
   etc.) so you can give them the right instructions.

---

## Steps

### 1 — Open the publisher management page

Navigate to: https://marketplace.visualstudio.com/manage/publishers/listellm

### 2 — Add the domain

1. Select the **listellm** publisher from the left panel.
2. Open the **Details** tab.
3. In the **Verified domain** section, enter the domain (e.g. `example.com`).
4. Click **Save**, then click **Verify**.

### 3 — Get the TXT record value

A dialog will appear with a DNS TXT record to add. It will look something like:

```
Type:  TXT
Host:  @  (root of the domain)
Value: MS=ms<unique-code>
TTL:   3600 (or use the provider default)
```

Copy the exact value shown — it is unique to the publisher.

### 4 — Add the TXT record at the DNS provider

**Cloudflare:**
DNS → Add record → Type: `TXT`, Name: `@`, Content: `<value>`

**AWS Route 53:**
Hosted zone → Create record → Type: `TXT`, Value: `"<value>"` (include quotes)

**Namecheap:**
Advanced DNS → Add New Record → TXT Record, Host: `@`, Value: `<value>`

**GoDaddy:**
DNS Management → Add → Type: `TXT`, Host: `@`, TXT Value: `<value>`

Check propagation before verifying:

```bash
dig TXT yourdomain.com +short
# or
nslookup -type=TXT yourdomain.com
```

DNS propagation can take a few minutes to up to 48 hours.

### 5 — Confirm in the portal

Once the TXT record is visible in DNS output, return to the publisher management dialog and
click **Verify**. If the record is found, the domain is confirmed.

### 6 — Verified badge review (optional, separate process)

The blue verified badge requires an additional manual review by the Marketplace team
(up to 5 business days). Prerequisites for the badge:

- Domain is at least 6 months old
- Publisher has maintained extensions for at least 6 months
- Website responds correctly over HTTPS

> **Note**: Domain verification is required to publish. The verified _badge_ is separate and
> only granted after the review above. You can publish without the badge.

---

## After verification is complete

Once the domain is verified, the extension is ready to publish. The publisher ID `listellm`
is already set in all the correct places in the codebase:

- `vss-extension.json` — `"publisher": "listellm"`
- `scripts/publish-azure-extension.sh` — VSIX filename and Marketplace URL
- `.github/workflows/publish-azure-extension.yaml` — VSIX filename and Marketplace URLs
- `README.md` — Marketplace install link

To publish:

```bash
# Local publish
AZURE_DEVOPS_EXT_PAT=<pat> ./scripts/publish-azure-extension.sh

# Dry run first (recommended)
AZURE_DEVOPS_EXT_PAT=<pat> ./scripts/publish-azure-extension.sh --dry-run
```

Or trigger the **Publish Azure Extension** GitHub Actions workflow manually.
