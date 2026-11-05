# Design System & Spécifications UI/UX - Envoy

Document de référence pour le design et le développement frontend d'Envoy, inspiré de l'esthétique institutionnelle moderne et épurée (style Cantor8).

---

## 1. Direction Artistique & Identité Visuelle

* **Style Général** : Tech institutionnel, ultra-souverain, moderne, épuré et à haut contraste.
* **Typographie** : Neo-grotesque suisse (ex. *Inter*, *PP Neue Montreal*, ou *SF Pro Display*) avec un fort contraste de taille (titres très larges et lisibles, métadonnées fines et subtiles).
* **Motifs Graphiques** : Lignes filaires subtiles (*line-art circuit*) arquant sur le fond, angles quasi droits (`rounded-sm`) partagés entre cartes et boutons.

---

## 2. Palette de Couleurs (Tokens Tailwind CSS)

### Couleurs Principales
* **Primary / Brand Background** : `#0A4BD6` (Bleu Cobalt Royal intense).
* **Surface Overlay / Cards** : `#0C52EB` ou `rgba(255, 255, 255, 0.05)` (Bleu légèrement plus clair ou translucide pour créer de la profondeur).
* **Text Primary** : `#FFFFFF` (Blanc pur).
* **Text Secondary** : `rgba(255, 255, 255, 0.7)` (Blanc avec opacité à 70%).
* **Muted / Kicker Text** : `rgba(255, 255, 255, 0.45)` (Pour les tags d'en-tête et métadonnées en MAJUSCULES).

### Éléments d'Action (Buttons & Interactive Elements)
* **Button White Solid** :
  * Background : `#FFFFFF` (Blanc pur).
  * Text : `#0A4BD6` (Bleu cobalt).
  * Shape : Même arrondi que les cartes (`rounded-sm`), presque droit.
* **Button Accent / Square Icon Box** :
  * Icon Container : Carré légèrement arrondi (`rounded-sm`) avec bordure fine `border border-white/20`.
  * Arrow / Icon : Icône à 45° (`arrow-up-right`) vers le haut à droite.

---

## 3. Typographie & Hierarchie

```css
/* Configuration Typographique Principale */
font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
```

1. **Tag / Kicker (ex: "■ FOUNDATION")** :
   * Style : Majuscules, `text-xs`, `font-mono` ou `font-sans`, espacement `tracking-widest`.
   * Couleur : `text-white/50`.
   * Préfixe : Carré plein subtil `■`.

2. **Grand Titre (Hero Heading)** :
   * Style : `text-5xl` à `text-7xl`, `font-medium` ou `font-semibold`, `tracking-tight`.
   * Couleur : `text-white`.

3. **Texte de Présentation / Subheading** :
   * Style : `text-xl` à `text-2xl`, `font-normal`, `leading-snug`.
   * Couleur : `text-white/90`.

4. **Corps de Texte / Description** :
   * Style : `text-sm` à `text-base`, `leading-relaxed`.
   * Couleur : `text-white/70`.

---

## 4. Composants UI Clés

### A. Barre de Navigation (Navbar)
* **Conteneur** : Position flottante ou intégrée, fond transparent avec éléments groupés.
* **Navigation centrale** :
  * Groupe translucide : `bg-white/10 backdrop-blur-md rounded-sm px-1.5 py-1.5`.
  * Liens internes : Actifs (`bg-white text-[#0A4BD6] rounded-sm px-4 py-1.5`) et inactifs transparents (`text-white hover:text-white/80 rounded-sm px-4 py-1.5`).
* **Actions à droite** : Liens texte fins + Bouton principal "Get in Touch" (ou "Connexion / Dashboard") en `rounded-sm` blanc avec carré d'icône fléchée.

### B. Boutons & Actions
* **Format Double (Bouton avec Icône Séparée)** — même rayon que les cards (`rounded-sm`) :
  * Segment Texte : `bg-white text-[#0A4BD6] rounded-l-sm px-5 py-2.5 font-medium`.
  * Segment Icône : `bg-[#0842BC] text-white rounded-r-sm px-3 py-2.5 inline-flex items-center`.
  * Icône : Flèche diagonale `↗` (Lucide React `ArrowUpRight`).

### C. Lignes d'Arrière-plan (Structural Lines)
* **Grid / Background Circuits** : Lignes SVG fines (`border-white/10` ou `stroke-white/15`) à angles arrondis (`rx=16` ou `rounded-2xl`) traversant la page pour relier visuellement les sections et donner une impression d'infrastructure réseau.

---

## 5. Exemples de Code UI (Tailwind CSS)

### Bouton principal en React + Tailwind
```tsx
export const PrimaryButton = ({ label, href }: { label: string; href: string }) => {
  return (
    <a href={href} className="inline-flex items-center group rounded-sm">
      <span className="bg-white text-[#0A4BD6] font-medium text-sm px-6 py-3 rounded-l-sm transition-all group-hover:bg-opacity-95">
        {label}
      </span>
      <span className="bg-[#0842BC] text-white p-3 rounded-r-sm border-l border-white/10 transition-all group-hover:bg-[#06369d]">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="7" y1="17" x2="17" y2="7"></line>
          <polyline points="7 7 17 7 17 17"></polyline>
        </svg>
      </span>
    </a>
  );
};
```

### Navbar en Tailwind CSS
```tsx
export const Navbar = () => {
  return (
    <nav className="w-full flex items-center justify-between px-8 py-6 bg-[#0A4BD6]">
      {/* Logo */}
      <div className="flex items-center space-x-2 text-white font-bold tracking-wider text-xl">
        <span>ENVOY</span>
      </div>

      {/* Center Nav */}
      <div className="hidden md:flex items-center bg-white/10 backdrop-blur-md p-1.5 rounded-sm space-x-1 border border-white/10">
        <button className="bg-white text-[#0A4BD6] px-5 py-1.5 rounded-sm text-sm font-medium shadow-sm">Overview</button>
        <button className="text-white hover:text-white/80 px-4 py-1.5 rounded-sm text-sm font-medium">Domains</button>
        <button className="text-white hover:text-white/80 px-4 py-1.5 rounded-sm text-sm font-medium">API Keys</button>
        <button className="text-white hover:text-white/80 px-4 py-1.5 rounded-sm text-sm font-medium">Logs</button>
        <button className="text-white hover:text-white/80 px-4 py-1.5 rounded-sm text-sm font-medium">Docs</button>
      </div>

      {/* Right Action */}
      <div className="flex items-center space-x-4">
        <a href="#login" className="text-white text-sm font-medium hover:text-white/80">Console</a>
        <a href="#get-started" className="bg-white text-[#0A4BD6] text-sm font-medium px-5 py-2 rounded-sm inline-flex items-center space-x-2">
          <span>Get Started</span>
          <span className="bg-[#0A4BD6] text-white p-1 rounded-sm text-xs">↗</span>
        </a>
      </div>
    </nav>
  );
};
```