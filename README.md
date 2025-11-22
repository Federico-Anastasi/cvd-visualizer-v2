# CVD Visualizer V2.1 🚀

Versione professionale del visualizzatore real-time con massima densità informativa, threshold bands e legenda inline.

## 🆕 Novità V2.1 (2025-11-22)

### Informazioni Recuperate da V1
- ✅ **CVD Candlestick** ripristinato (opacity 0.35 per non coprire prezzo)
- ✅ **Ratio numbers** sopra candele prezzo (font 9, grigio chiaro)
- ✅ **Signal badges** sotto candele prezzo (marker colorati con testo)
- ✅ **Threshold bands** dinamiche nel pannello efficiency
- ✅ **Legenda segnali** completa nella sidebar

### Filosofia V2.1
**"Massima informazione, minimo clutter"** - combina la densità informativa di V1 con la pulizia visiva di V2.0

## 🆚 Novità V2.0 rispetto a V1

### Visualizzazione Migliorata
- ✅ **CVD come linea gradient** invece di candlestick (più chiaro)
- ✅ **Volume Profile** con breakdown buy/sell per candela
- ✅ **Signal badges circolari** colorati (no più testo sovrapposto)
- ✅ **Zone coloring** per cumulative signal (verde/rosso)
- ✅ **Alert flash** quando cumulative >±4.5
- ✅ **Sidebar KPI** con 6 metriche real-time

### Salvataggio Dati Completo
- ✅ **Trade raw tick-by-tick** (tutti i trade ricevuti)
- ✅ **Candele aggregate** con volume buy/sell
- ✅ **CVD timeseries** completo (OHLC)
- ✅ **Signals** (compatibile con V1)
- ✅ **KPI snapshots** ogni 5 secondi

### Controlli Interattivi
- ✅ **Slider threshold** per RATIO_STRONG e RATIO_WEAK
- ✅ **KPI dashboard** live in sidebar

---

## 📁 Struttura File

```
cvd_visualizer_v2/
├── main_v2.py                          # Script principale V2
├── data/
│   └── session_[timestamp]/            # Una cartella per sessione
│       ├── trades_raw.csv              # Trade tick-by-tick
│       ├── candles_3m.csv              # Candele OHLC + volume
│       ├── cvd_timeseries.csv          # CVD OHLC
│       ├── signals.csv                 # Ratio, signal, cumulative
│       └── kpi_snapshots.csv           # KPI ogni 5s
├── output/                             # Reserved per export
├── .gitignore
└── README.md                           # Questo file
```

---

## 🚀 Come Avviare

```bash
streamlit run main.py
```

---

## 📊 Layout Dashboard

### Sidebar (KPI Real-time)
1. **Volume 24h**: Volume totale BTC scambiato
2. **Trades/min**: Media trade al minuto
3. **CVD Net**: Posizione netta CVD corrente
4. **Last Signal**: Ultimo segnale con badge colorato
5. **Uptime**: Tempo di esecuzione sessione
6. **Next Update**: Progress bar prossimo aggiornamento

### Pannello 1 (50%) - Price + CVD + Overlays (V2.1)
- **Candele prezzo**: Verde/rosso standard
- **CVD candlestick**: Blu/giallo trasparente (opacity 0.35), shiftate -30s
  - Mostra OHLC del CVD per ogni candela
  - Visualizza volatilità interna del CVD
- **Ratio numbers**: Numeri grigio chiaro sopra candele (font 9)
  - Valore efficiency ratio preciso (es. "1.5", "-2.3")
- **Signal badges**: Marker colorati sotto candele (diametro 7px)
  - Verde (#00ff41) per segnali positivi (+1/+2/+3)
  - Rosso (#ff0051) per segnali negativi (-1/-2/-3)
  - Testo bianco con valore segnale
- **Asse Y doppio**: Prezzo (sx), CVD (dx)

### Pannello 2 (15%) - Volume Profile
- **Bar verde**: Volume buy per candela
- **Bar rosso**: Volume sell per candela (negativo)
- **Informazione**: Distribuzione buy/sell pressure

### Pannello 3 (20%) - Efficiency + Threshold Bands (V2.1)
- **Bande threshold dinamiche**:
  - Zona verde chiara: ratio > RATIO_STRONG (movimento coerente forte)
  - Zona rossa chiara: ratio < -RATIO_STRONG (movimento coerente forte inverso)
  - Zona gialla: RATIO_WEAK < |ratio| < RATIO_STRONG (assorbimento)
  - Aggiornamento real-time quando si modificano slider
- **Linee soglia**:
  - RATIO_STRONG: linea tratteggiata verde/rossa
  - Zero line: linea bianca (divergenza)
- **Area chart blu**: Efficiency ratio normalizzato
- **Badge circolari**: Segnali -3 a +3 (size 20)
  - Verde: +1, +2, +3 (bullish)
  - Rosso: -1, -2, -3 (bearish)
- **Posizionamento**: Sopra linea efficiency, no overlap

### Pannello 4 (15%) - Cumulative Signal + Zones
- **Linea arancione**: Segnale cumulativo
- **Zona verde chiaro**: Area >+3 (bullish accumulation zone)
- **Zona rossa chiaro**: Area <-3 (bearish accumulation zone)
- **Soglie tratteggiate**: ±4.5 (entry/exit point)
- **Alert flash**: Background lampeggia quando >±4.5
- **Reset automatico**: Si azzera a ±4 solo se ultimo estremo era opposto

#### ⚠️ LOGICA CONTRARIAN (Mean-Reversion)
**IMPORTANTE**: Questo NON è un sistema trend-following!

**Entry LONG (acquisto)**:
- **Quando**: Cumulative scende a **-4 o inferiore** (zona rossa)
- **Perché**: Accumulo di segnali bearish (-3/-2/-1) indica **oversold**
- **Logica**: Mercato ha venduto troppo → attesa rimbalzo rialzista
- **Esempio**: Cumulative = -4.5 → **BUY SIGNAL** (contrarian)

**Entry SHORT (vendita)**:
- **Quando**: Cumulative sale a **+4 o superiore** (zona verde)
- **Perché**: Accumulo di segnali bullish (+3/+2/+1) indica **overbought**
- **Logica**: Mercato ha comprato troppo → attesa correzione ribassista
- **Esempio**: Cumulative = +4.5 → **SELL SIGNAL** (contrarian)

**Strategia**: Fai l'**opposto** di ciò che i segnali indicano quando raggiungono l'estremo!
- Zona verde (>+4) = mercato overbought → **vendi** (non comprare)
- Zona rossa (<-4) = mercato oversold → **compra** (non vendere)

---

## 🎛️ Controlli Interattivi

### Sidebar Controls
- **RATIO_STRONG**: Slider 1.0-3.0 (default 1.5)
  - Soglia per movimento "coerente forte" (±3)
- **RATIO_WEAK**: Slider 0.1-1.0 (default 0.5)
  - Soglia per "assorbimento" (±1)

### Modifiche in Real-time
I parametri si aggiornano immediatamente senza restart.

---

## 💾 Dati Salvati

### 1. trades_raw.csv
Tutti i trade tick-by-tick da WebSocket.

**Colonne**:
- `timestamp`: Timestamp trade
- `price`: Prezzo
- `volume`: Volume
- `side`: B (buy) o A (sell)

**Uso**: Replay completo, debugging, backtesting avanzato

---

### 2. candles_3m.csv
Candele aggregate a 3 minuti con volume breakdown.

**Colonne**:
- `timestamp`: Timestamp candela
- `open`, `high`, `low`, `close`: OHLC prezzo
- `volume_buy`: Volume buy aggregato
- `volume_sell`: Volume sell aggregato
- `trade_count`: Numero trade nella candela

**Uso**: Analisi volume profile, order flow

---

### 3. cvd_timeseries.csv
Serie temporale CVD aggregata.

**Colonne**:
- `timestamp`: Timestamp candela
- `cvd_open`, `cvd_high`, `cvd_low`, `cvd_close`: CVD OHLC
- `cvd_cumsum`: CVD cumulativo

**Uso**: Analisi momentum, divergenze

---

### 4. signals.csv
Segnali calcolati (compatibile V1).

**Colonne**:
- `timestamp`: Timestamp candela
- `price`: Prezzo chiusura
- `ratio`: Efficiency ratio
- `signal`: Segnale -3 a +3
- `cumulative`: (placeholder, calcolare da segments)

**Uso**: Backtesting strategie, ottimizzazione parametri

---

### 5. kpi_snapshots.csv
Snapshot KPI ogni 5 secondi.

**Colonne**:
- `timestamp`: Timestamp snapshot
- `volume_24h`: Volume 24h totale
- `trades_per_min`: Trade al minuto
- `cvd_net`: CVD netto corrente
- `last_signal`: Ultimo segnale

**Uso**: Monitoraggio performance, analisi trend

---

## 🎨 Color Scheme

| Elemento | Colore | Hex | Significato |
|----------|--------|-----|-------------|
| Buy | Verde | #00ff41 | Acquisti |
| Sell | Rosso | #ff0051 | Vendite |
| CVD/Neutral | Blu | #00d4ff | Neutrale |
| Cumulative | Arancione | #ff7f0e | Cumulativo |

---

## 📖 Teoria (identica a V1)

### CVD (Cumulative Volume Delta)
**Calcolo**: Somma cumulativa di (volume buy - volume sell)
- **Buy trade**: CVD ↑
- **Sell trade**: CVD ↓
- **Shift -30s**: Anticipa movimento prezzo

### Efficiency Ratio
**Formula**: `ratio = Δprezzo_norm / ΔCVD_norm`

**Interpretazione**:
- **>1.5**: Movimento efficiente, forte direzionalità
- **<0.5**: Assorbimento, possibile range
- **<0**: Divergenza, possibile inversione

### Signal
- **+3/-3**: Coerente forte (ratio >1.5)
- **+2/-2**: Divergenza (ratio <0)
- **+1/-1**: Assorbimento (0 <ratio <0.5)
- **0**: Neutrale

### Cumulative Signal - Logica Mean-Reversion

**Calcolo**:
- Somma progressiva segnali (-3 a +3)
- Reset a ±4 se ultimo estremo era opposto
- **±4.5**: Soglie operative

**⚠️ STRATEGIA CONTRARIAN**:

Il cumulative signal misura l'**esaurimento del movimento**, non la direzione da seguire!

| Cumulative | Situazione Mercato | Azione Trading |
|------------|-------------------|----------------|
| **> +4** (zona verde) | Overbought (troppi buy) | **SELL** (contrarian) |
| **< -4** (zona rossa) | Oversold (troppi sell) | **BUY** (contrarian) |
| **tra -3 e +3** | Neutrale | Aspetta segnale |

**Esempio**:
- Cumulative sale a +5 → molti segnali +3/+2/+1 → mercato "esausto" rialzista → **vendi** (non comprare!)
- Cumulative scende a -5 → molti segnali -3/-2/-1 → mercato "esausto" ribassista → **compra** (non vendere!)

**Filosofia**: Più il mercato si muove in una direzione (accumulo segnali), più è probabile un'inversione.

---

## 🔄 Auto-Resume Session

**Feature importante**: Il sistema riprende **sempre** l'ultima sessione automaticamente!

### Come Funziona

**Ogni riavvio**:
- ✅ Riprende l'ultima sessione automaticamente (quella con timestamp più recente)
- ✅ Carica tutti i trade precedenti da `trades_raw.csv`
- ✅ Ricostruisce grafici con dati storici
- ✅ Continua a salvare nella stessa cartella
- ✅ **Continuità totale**: nessuna perdita visiva

**Per creare una nuova sessione**:
- Rinomina manualmente la cartella `data/session_[timestamp]/` in qualcosa che non inizi con "session_"
- Oppure sposta/elimina tutte le cartelle session esistenti
- Al prossimo riavvio verrà creata una nuova sessione

### Modifiche Parametri Frontend

**Cambio RATIO_STRONG/RATIO_WEAK**:
- ✅ Mantiene tutti i trade in memoria
- ✅ Ricalcola segnali con nuovi parametri
- ✅ NO perdita dati
- ✅ Update immediato

**Vantaggio**: Puoi sperimentare con i parametri senza perdere la vista corrente!

### Indicatore Sidebar

La sidebar mostra sempre lo stato della sessione:
- 📂 **"Resumed: session_XXX"** (verde) → sessione ripresa (99% dei casi)
- 🆕 **"New Session: session_XXX"** (blu) → nuova sessione (solo se non esistono sessioni precedenti)
- Caption: numero trade caricati dalla sessione precedente

---

## 🆚 Differenze V1 vs V2.0 vs V2.1

| Feature | V1 | V2.0 | V2.1 |
|---------|----|----|------|
| CVD visualizzazione | Candlestick | Line gradient | Candlestick trasparente ✅ |
| Ratio numbers overlay | ✅ Sopra candele | ❌ | ✅ Sopra candele |
| Signal badges overlay | ❌ (testo) | ⚠️ Solo panel 3 | ✅ Sotto candele + panel 3 |
| Threshold bands | ❌ | ❌ | ✅ Dinamiche |
| Legenda inline | ❌ | ❌ | ✅ Sidebar |
| Volume breakdown | ❌ | ✅ | ✅ |
| Auto-resume | ❌ | ⚠️ Solo <3min | ✅ Sempre |
| Parametri real-time | ❌ | ✅ | ✅ |
| KPI dashboard | ❌ | ✅ | ✅ |
| Dati salvati | Solo signals.csv | 5 CSV completi | 5 CSV completi |
| Alert visivi | ❌ | ✅ | ✅ |
| Zone coloring | ❌ | ✅ | ✅ |
| Controlli interattivi | ❌ | ✅ | ✅ |
| Progress bar update | ❌ | ✅ | ✅ |

**V2.1** = Best of both worlds: densità informativa V1 + pulizia visiva V2.0 + strumenti professionali

---

## 🔧 Dipendenze

```bash
pip install streamlit plotly pandas numpy websockets
```

Stesse dipendenze di V1.

---

## 📝 Note Tecniche

### Performance
- **Thread separato WebSocket**: No lag raccolta dati
- **Thread separato CSV writer**: No lag salvataggio
- **Buffer intelligente**: Ultimi 100 trade salvati ogni ciclo
- **Update rate**: 5 secondi (configurabile)

### Retrocompatibilità
- File `signals.csv` compatibile con V1
- Stessa logica CVD/ratio/signal
- Può usare dati V1 per analisi storica

### Sessioni
- Ogni esecuzione crea `session_[timestamp]/`
- Retention illimitata
- Nessuna sovrascrizione dati precedenti

---

## 🎯 Casi d'Uso

### 1. Trading Real-time Mean-Reversion
**Setup**:
1. Monitora cumulative signal in pannello 4
2. Attendi zona rossa (<-4) o verde (>+4)
3. Verifica volume profile per conferma

**Entry LONG (esempio)**:
- Cumulative scende a **-4.5** (zona rossa) ✅
- Volume profile mostra molti sell recenti (bar rosse dominanti) ✅
- Efficiency ratio diventa negativo (divergenza) ✅
- **→ COMPRA** (contrarian: mercato oversold)

**Entry SHORT (esempio)**:
- Cumulative sale a **+4.5** (zona verde) ✅
- Volume profile mostra molti buy recenti (bar verdi dominanti) ✅
- Efficiency ratio molto alto (movimento esaurito) ✅
- **→ VENDI** (contrarian: mercato overbought)

**Exit**:
- Quando cumulative si resetta a 0 (cambio regime)
- Oppure TP/SL basati su ATR

### 2. Backtesting
- Usa `trades_raw.csv` per replay
- Ottimizza RATIO_STRONG/WEAK con `signals.csv`
- Valida segnali con `candles_3m.csv`

### 3. Ricerca
- Analizza correlazione CVD-prezzo
- Studia efficacia segnali
- Identifica pattern ricorrenti

### 4. Debugging
- Trace completo da tick a segnale
- Verifica calcoli CVD
- Analisi anomalie

---

## ⚠️ Limitazioni

- **No pausa/resume**: Feature futura
- **No export snapshot**: Feature futura
- **No timeframe switcher**: Fisso 3min (modificabile in codice)
- **No dark/light mode**: Fisso dark

---

## 🚀 Roadmap Future Features

- [ ] Pause/Resume con buffer background
- [ ] Export snapshot PNG + ZIP dati
- [ ] Timeframe switcher (1m/3m/5m/15m)
- [ ] Reset manuale cumulative signal
- [ ] Dark/Light mode toggle
- [ ] Heatmap intensità trade
- [ ] Notifiche alert (email/telegram)
- [ ] Backtesting integrato

---

## 📞 Support

Per domande o bug, riferirsi alla documentazione V1 (teoria identica).

**Versione**: 2.1
**Data**: 2025-11-22
**Autore**: MangoLabs
