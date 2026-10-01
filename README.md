# mod-forza-lleida-pantalla

Animació per al cub LED del pavelló (llenç **4608 × 640 px @ 60 Hz**, 360°): pluja de píxels quadrats de 72×72 i logo de MOD a cada cara plana.

Fet amb **Vite + Three.js** (JavaScript, sense framework). És una web estàtica pensada per a la font *Navegador* d'OBS.

## Desenvolupament

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
```

## OBS

Font → *Navegador* · URL del desplegament (Vercel) · amplada **4608** · alçada **640** · FPS **60**.

## Paràmetres per URL

| Paràmetre | Exemple | Efecte |
|---|---|---|
| `theme` | `?theme=white` | Fons blanc en lloc de blau |
| `guides` | `?guides=1` | Marca cares i cantonades |
| `loop` | `?loop=16` | Durada del bucle (s) |
| `drops` | `?drops=70` | Quantitat de blocs que cauen |
| `t` | `?t=8` | Congela un instant (proves) |

## Vercel

Importa el repo a Vercel: detecta Vite automàticament (build `npm run build`, sortida `dist`).
