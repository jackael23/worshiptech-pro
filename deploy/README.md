# Hosted server (accounts, bayad, cloud sync)

Isang maliit na VPS (1–2 GB RAM, Ubuntu, may Docker) ang kailangan. Tatlong container: ang app,
CouchDB, at Caddy (HTTPS). Walang public na port ang CouchDB — sa `/couch` ng app lang ito naaabot.

## Unang setup

1. Ituro ang domain (hal. `app.inyongdomain.com`) sa IP ng VPS (DNS A record).
2. Sa VPS: i-clone ang repo, tapos:

   ```
   cd deploy
   cp .env.example .env      # punan: DOMAIN, COUCHDB_ADMIN_PASSWORD, (PayMongo keys)
   docker compose up -d --build
   ```
3. Buksan ang `https://DOMAIN` → Account → Gumawa ng account.
4. PayMongo webhook: `https://DOMAIN/api/billing/webhook`, event `checkout_session.payment.paid`
   (tingnan ang README sa root).

## Sa laptop ng simbahan

Sa `.env` ng app sa laptop, isang linya lang:

```
CLOUD_URL="https://DOMAIN"
```

Ang login, bayad at cloud sync ng laptop ay dadaan na sa hosted server. Hindi kailangan ng
CouchDB o ng anumang password sa laptop. Gumagana pa rin nang walang internet ang songs, Bible,
projection, at (para sa may plan) phone remote at Lineups.

## Update

```
git pull && cd deploy && docker compose up -d --build
```

## Backup (mahalaga)

Nasa Docker volume na `couch-data` ang lahat ng account, bayad at library ng mga simbahan.
Wala pang kasamang awtomatikong backup dito — mag-set up ng araw-araw na kopya ng volume
(o snapshot ng VPS) bago tumanggap ng totoong customer.

## Fauxton (admin)

Hindi ito bukas sa internet. Gumamit ng SSH tunnel sa container ng CouchDB kapag kailangan.
