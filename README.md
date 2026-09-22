# journo-hub

Personal journalist hub page: bio, published work, contact, and a public
safety/check-in protocol. Static site, no build step, free to host, designed
to be mirrored across multiple providers so no single takedown removes it.

## 1. Fill in your details

Everything you need to change is marked `[LIKE THIS]` in:
- `index.html` — name, bio, project links, contact info, safety protocol
- `sitemap.xml` — domain + last-modified date
- `robots.txt` — domain
- `CNAME` — **only if you're using a custom domain.** If you're just using
  the free `username.github.io` URL, delete this file
  (`rm CNAME`) or GitHub Pages will misconfigure itself trying to serve the
  placeholder domain.

## 2. Deploy — primary host (GitHub Pages)

```bash
git init
git add -A
git commit -m "Initial journo-hub site"
gh repo create journo-hub --public --source=. --push
```

Then in the repo on GitHub: **Settings → Pages → Source: Deploy from branch →
main / (root)**. Your site will be live at `https://<username>.github.io/journo-hub/`
within a few minutes (or at your custom domain if you configured `CNAME` + DNS).

## 3. Deploy — mirror (Cloudflare Pages)

1. Go to https://pages.cloudflare.com, connect the same GitHub repo.
2. Build command: none. Output directory: `/` (root).
3. Deploy — you'll get a free `*.pages.dev` URL as a second, independently-hosted copy.

Keep both links handy. If one host ever takes the page down or is blocked,
switch your bio links to the other immediately.

## 4. Optional — censorship-resistant mirror (IPFS)

For a copy that isn't dependent on any single company's decision to host it:

1. Create a free account at https://fleek.co or https://web3.storage.
2. Connect the same repo (Fleek) or drag-and-drop the folder (web3.storage).
3. You'll get a content-addressed `ipfs://<hash>` and a gateway URL like
   `https://<hash>.ipfs.dweb.link` — the gateway URL is a normal https link
   you can put anywhere (Google can crawl it), while the `ipfs://` hash is
   what makes the content tamper-evident and pin-able by anyone who mirrors it.
4. Optional: point an ENS domain (`yourname.eth`) at the IPFS hash, viewable
   via `https://yourname.eth.limo`.

## 5. Get indexed and ranking fast

1. Go to https://search.google.com/search-console, add your domain (or the
   `github.io` URL), verify ownership (GitHub Pages: DNS TXT record, or the
   HTML-file method if using a custom domain; the plain `github.io` URL
   verifies via the HTML meta-tag method).
2. Submit `sitemap.xml` under **Sitemaps** in Search Console. This gets you
   crawled in hours/days instead of waiting for organic discovery.
3. Use **Request Indexing** on the exact URL for an even faster nudge.
4. Add this page's URL to the `sameAs` list on your other profiles — Twitter/X
   bio, LinkedIn, Muck Rack, ORCID, any outlet author pages — for backlinks
   from established domains. This is what actually moves you to #1 for a
   search of your own name; on-page SEO alone won't do it.
5. Keep the name spelling **identical** everywhere (this page, social bios,
   bylines) so Google merges it into one entity instead of splitting it.

## 6. Maintenance

This is meant to be "evergreen" — static files, no dependencies, nothing to
patch. Update it by editing `index.html` directly and re-running:

```bash
git add -A && git commit -m "Update bio/projects" && git push
```

Both the GitHub Pages and Cloudflare Pages mirrors will redeploy automatically
on push since both are connected to the same repo.
