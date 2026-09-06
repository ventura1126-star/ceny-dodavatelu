# Ceník dodavatelů — Mistři dřeva s.r.o.

Aplikace, do které se nahrávají PDF doklady od dodavatelů — **faktury i cenové
nabídky**. Z každého dokladu se vytěží všechny položky a z nich se postupně staví
databáze nákupních cen materiálu. Pak stačí zadat, co hledáte — třeba
`kvh 60x120` — a uvidíte, za kolik ten materiál máte u kterého dodavatele, jak se
cena vyvíjela a kolik jste u koho celkem odebrali.

## Fakturováno vs. nabídnuto

Doklady se dělí na dvě cenové větve, které se nikde nesčítají:

| Větev | Doklady | Co říká |
| --- | --- | --- |
| **Fakturováno** | faktura, dodací list | co jste za materiál skutečně zaplatili |
| **Nabídnuto** | cenová nabídka, potvrzení objednávky | co vám kdo nezávazně nabídl, s platností do data |

Je to zásadní rozdíl: nabídková cena je nezávazná a může se od konečné faktury
lišit. Kdyby se obojí míchalo, „nejlepší cena" by mohla být částka, kterou vám
nikdo nikdy nenaúčtoval. Druh dokladu pozná aplikace sama z jeho záhlaví a při
kontrole ho můžete přepsat.

V kalkulaci se ve výchozím režimu počítá **platnou nabídkou, pokud je novější než
poslední faktura** — za tu materiál skutečně koupíte. Jde přepnout na „jen
fakturované" nebo „jen nabídkové" ceny; u každé částky je vidět zdroj.

## Co aplikace umí

| Obrazovka | K čemu je |
| --- | --- |
| **Nahrát doklady** | Přetáhnete PDF (i víc najednou), Claude pozná druh dokladu a přečte hlavičku i všechny řádky. |
| **Doklady** | Kontrola a potvrzení. Dokud doklad nepotvrdíte, do cen se nezapočítá. |
| **Materiály a ceny** | Vyhledávání materiálu → srovnání cen mezi dodavateli + graf vývoje ceny. |
| **Dodavatelé** | Kolik u koho odebíráme — podklad pro vyjednávání množstevních slev. |
| **Kalkulace** | Poskládáte materiál na zakázku a spočítá se nákladová cena podle vašich skutečných cen. |

## Jak funguje párování materiálů

Každý dodavatel píše stejný materiál jinak. Aplikace to řeší ve třech krocích:

1. **Alias** — text položky, který jste u daného dodavatele už jednou potvrdili,
   se příště napáruje sám. Tohle je hlavní mechanismus: čím víc faktur
   zpracujete, tím míň práce s kontrolou máte.
2. **Podobnost** — u neznámého textu se hledá nejbližší materiál v katalogu
   (porovnávají se slova i rozměry). Nabídne se jako návrh ke schválení.
3. **Nový materiál** — když nic nesedí, po potvrzení faktury se materiál založí
   do katalogu pod názvem, který upravíte v našeptávači.

Řádky jako doprava, palety nebo zaokrouhlení se poznají samy a do cen se
nezapočítávají.

## Spuštění na svém počítači

Potřebujete Node.js 20 nebo novější.

```bash
npm install
cp .env.example .env
```

Do `.env` doplňte klíč z <https://console.anthropic.com/settings/keys>:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Pak spusťte:

```bash
npm run dev
```

Aplikace poběží na <http://localhost:3000>. Databáze se vytvoří sama jako soubor
`data/ceny.db`.

### Ukázková data

Pokud si chcete aplikaci osahat dřív, než nahrajete první skutečnou fakturu:

```bash
npm run db:seed
```

Vloží tři smyšlené dodavatele a osm měsíců nákupů. Skript odmítne běžet, pokud
už v databázi nějaké faktury jsou. Až budete chtít začít načisto, smažte soubor
`data/ceny.db` a spusťte aplikaci znovu.

## Nasazení

Repozitář je připravený tak, aby stejný kód běžel lokálně i na serveru — liší se
jen dvě proměnné prostředí.

### Vercel + Turso (nejjednodušší cesta)

1. Nahrajte repozitář na GitHub.
2. Na <https://turso.tech> založte databázi a vezměte si její URL a token.
3. Ve Vercelu naimportujte repozitář a nastavte proměnné:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=libsql://vase-databaze.turso.io
DATABASE_AUTH_TOKEN=...
```

Schéma databáze se založí samo při prvním spuštění.

### Vlastní server

Funguje i klasické `npm run build && npm start` s `DATABASE_URL=file:./data/ceny.db`.
V tom případě zálohujte adresář `data/` — je v něm celá databáze včetně
originálních PDF faktur.

## Náklady na čtení faktur

Vytěžení jedné faktury je jeden dotaz na Claude API. U běžné faktury o dvou
stranách to vychází řádově na jednotky korun. Model se dá přepnout v `.env`:

```
ANTHROPIC_MODEL=claude-sonnet-5   # levnější varianta
ANTHROPIC_EFFORT=medium           # low | medium | high
```

## Struktura projektu

```
src/
  app/            stránky (Next.js App Router)
  components/     sdílené komponenty UI
  db/             připojení k databázi, schéma, ukázková data
  lib/
    extract.ts    čtení PDF faktur přes Claude API
    matching.ts   párování položek faktur na materiály v katalogu
    normalize.ts  normalizace názvů, rozměrů a podobnost textů
    repo.ts       dotazy nad databází (ceny, statistiky)
    actions.ts    serverové akce (nahrání, potvrzení faktury, kalkulace)
```

## Na co si dát pozor

- **Ceny jsou vždy bez DPH a po slevě.** Když faktura uvádí jen cenu před
  slevou, dopočítá se z celkové částky za řádek.
- **Různé měrné jednotky.** Dodavatelé často prodávají v jiné jednotce, než ve
  které tvoří cenu — „30 bal" a zároveň „630 m" s cenou za metr. Aplikace vždy
  ukládá tu jednotku, ke které se vztahuje jednotková cena, protože jen ta je
  srovnatelná. Když se jednotky u jednoho materiálu liší, upozorní na to.
- **Kontrola se vyplatí.** Model čte i špatně naskenovaná PDF, ale u prvních
  faktur od nového dodavatele si projděte řádky pozorně. Co jednou potvrdíte,
  se používá i příště.
